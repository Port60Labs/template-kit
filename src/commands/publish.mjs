import { resolve } from 'node:path';
import { validateArtifact } from '../vendor/validator/validate.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';
import { buildZip } from '../lib/zip.mjs';
import { accessToken, api, apiBase, loadCredentials, requireCredentials } from '../lib/auth.mjs';

/**
 * `publish [dir]` (developer CLI stream A): validate, package and upload in one breath, then
 * submit the version for review. The upload lane is manifest-routed, so an unclaimed name CREATES
 * the template and a claimed one gains a version; the server runs the identical validation
 * again, and a human reviews before anything can reach a charity's site. `--no-submit` stops at
 * validated (submit later from the studio).
 *
 * `publish --ci` (stream B, docs/developer-cli-and-ci-publishing.md): the same validate and
 * package steps, but inside GitHub Actions there is no person to sign in. The workflow's own
 * OIDC token, minted by GitHub for the platform's audience, is the credential; the platform
 * verifies GitHub's signature and the repository trust the developer registered in the studio.
 * A trusted workflow does what a signed-in terminal does (a new name creates the template, an
 * owned name gains a version); review still decides.
 * Auto-detected inside Actions when this machine holds no stored login.
 */
export async function publish(args) {
  // The CLI's parser reads `--flag value` greedily, so `publish --ci ./theme` would swallow the
  // directory as the flag's value. Both flags here are booleans: hand a swallowed path back.
  for (const flag of ['ci', 'no-submit']) {
    if (typeof args[flag] === 'string') {
      args._.unshift(args[flag]);
      args[flag] = true;
    }
  }
  const ci = args.ci === true || (process.env.GITHUB_ACTIONS === 'true' && !loadCredentials());
  const creds = ci ? null : requireCredentials();
  if (!ci && !creds.workspace?.tenantId) {
    console.error('✗ No studio workspace on record. Run: p60-template-kit login');
    process.exit(1);
  }
  const dir = resolve(args._[0] ?? '.');
  const files = loadArtifactDir(dir);
  const { errors, manifest } = await validateArtifact(files);
  if (errors.length > 0) {
    console.error(`✗ not publishing, ${errors.length} validation error${errors.length === 1 ? '' : 's'}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const zip = buildZip(Object.entries(files).map(([path, content]) => ({ path, content })));
  console.log(`✓ ${manifest.name} ${manifest.version} validated, uploading${ci ? ' from CI' : ''}…`);

  if (ci) {
    await publishFromCi(args, zip);
    return;
  }

  const token = await accessToken(creds);
  const studio = `/api/admin/studio/tenants/${creds.workspace.tenantId}/studio`;
  const res = await api(creds, token, `${studio}/uploads`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: zip
  });
  if (!res.ok) {
    console.error(`✗ Upload refused (${res.status}): ${await errorMessage(res)}`);
    if (res.status === 403) {
      // The CLI holds the developer's OWN token; the server's permission model decides, exactly
      // as in the studio UI. A role below the studio's minimum publishes nowhere.
      console.error('  This account doesn\'t have permission to publish in that workspace.');
      console.error('  Sign in with an account that administers the developer studio.');
    }
    process.exit(1);
  }
  const outcome = await res.json();
  const upload = outcome.upload ?? {};
  if (outcome.templateCreated) {
    console.log(`✓ ${outcome.templateLabel} created from its manifest.`);
  }
  if (!printUpload(upload)) process.exit(1);

  if (args['no-submit']) {
    console.log('  Left unsubmitted (--no-submit). Submit it for review from your studio.');
    return;
  }

  // Submission needs the version row's id; the detail read supplies it.
  const detailRes = await api(creds, token, `${studio}/templates/${outcome.templateId}`);
  if (!detailRes.ok) {
    console.error(`⚠ Uploaded, but the submit step could not read the template (${detailRes.status}). Submit from your studio.`);
    process.exit(1);
  }
  const detail = await detailRes.json();
  const row = (detail.versions ?? []).find((v) => v.version === upload.version && v.status === 'VALIDATED');
  if (!row) {
    console.error('⚠ Uploaded, but the new version was not found in a submittable state. Submit from your studio.');
    process.exit(1);
  }
  const submitRes = await api(creds, token, `${studio}/templates/${outcome.templateId}/versions/${row.id}/submit`, {
    method: 'POST'
  });
  if (!submitRes.ok) {
    console.error(`⚠ Uploaded, but submitting for review failed (${submitRes.status}). Submit from your studio.`);
    process.exit(1);
  }
  console.log('✓ Submitted for review. You\'ll get an email when a reviewer decides.');
}

/** The audience the platform verifies; GitHub mints the token for exactly this value. */
export const CI_AUDIENCE = () => process.env.P60_CI_AUDIENCE || 'port60-studio-ci';

async function publishFromCi(args, zip) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    console.error('✗ publish --ci runs inside GitHub Actions, and the job needs the id-token permission:');
    console.error('    permissions:');
    console.error('      id-token: write');
    console.error('      contents: read');
    process.exit(1);
  }
  const oidc = await fetchActionsToken(requestUrl, requestToken, CI_AUDIENCE());

  const submit = !args['no-submit'];
  const res = await fetch(`${apiBase()}/api/public/studio/ci/publish?submit=${submit}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${oidc}`, 'content-type': 'application/zip' },
    body: zip
  });
  if (!res.ok) {
    console.error(`✗ Publish refused (${res.status}): ${await errorMessage(res)}`);
    if (res.status === 403) {
      console.error('  Trust this repository under Automate publishing in your studio,');
      console.error('  and check the workflow runs from a ref the trust allows (refs/tags/v* by default).');
    }
    process.exit(1);
  }
  const result = await res.json();
  if (result.templateCreated) {
    console.log(`✓ ${result.templateLabel ?? result.templateName} created from its manifest.`);
  }
  console.log(`✓ ${result.templateName} accepted this run from ${result.repository} (${result.ref}).`);
  if (!printUpload(result.upload ?? {})) process.exit(1);
  if (result.submitted) {
    console.log('✓ Submitted for review. The developer is emailed when a reviewer decides.');
  } else if (!submit) {
    console.log('  Left unsubmitted (--no-submit). Submit it for review from the studio.');
  } else {
    console.error(`⚠ Uploaded, but not submitted: ${result.submitDetail ?? 'submit from the studio.'}`);
    process.exit(1);
  }
}

/** GitHub's per-job token endpoint: the request URL already carries its query string. */
async function fetchActionsToken(requestUrl, requestToken, audience) {
  const url = `${requestUrl}${requestUrl.includes('?') ? '&' : '?'}audience=${encodeURIComponent(audience)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' } });
  if (!res.ok) {
    console.error(`✗ GitHub did not issue an OIDC token (${res.status}). Does the job have id-token: write?`);
    process.exit(1);
  }
  const body = await res.json();
  if (!body.value) {
    console.error('✗ GitHub returned no token value.');
    process.exit(1);
  }
  return body.value;
}

function printUpload(upload) {
  if (!upload.accepted) {
    console.error('✗ The platform rejected the version:');
    for (const e of upload.errors ?? []) console.error(`  - ${e}`);
    return false;
  }
  for (const w of upload.warnings ?? []) console.log(`  ⚠ ${w}`);
  console.log(`✓ Version ${upload.version} uploaded and validated.`);
  return true;
}

async function errorMessage(res) {
  const text = await res.text();
  try {
    const body = JSON.parse(text);
    return body.message ?? body.detail ?? text;
  } catch {
    return text;
  }
}
