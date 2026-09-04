import { resolve } from 'node:path';
import { validateArtifact } from '../vendor/validator/validate.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';
import { buildZip } from '../lib/zip.mjs';
import { accessToken, api, requireCredentials } from '../lib/auth.mjs';

/**
 * `publish [dir]` (developer CLI stream A): validate, package and upload in one breath, then
 * submit the version for review. The upload lane is manifest-routed, so an unclaimed name CREATES
 * the template and a claimed one gains a version — the server runs the identical validation
 * again, and a human reviews before anything can reach a charity's site. `--no-submit` stops at
 * validated (submit later from the studio).
 */
export async function publish(args) {
  const creds = requireCredentials();
  if (!creds.workspace?.tenantId) {
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
  console.log(`✓ ${manifest.name} ${manifest.version} validated, uploading…`);

  const token = await accessToken(creds);
  const studio = `/api/admin/studio/tenants/${creds.workspace.tenantId}/studio`;
  const res = await api(creds, token, `${studio}/uploads`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: zip
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const body = JSON.parse(text);
      message = body.message ?? body.detail ?? text;
    } catch {
      // plain-text error, shown as-is
    }
    console.error(`✗ Upload refused (${res.status}): ${message}`);
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
  if (!upload.accepted) {
    console.error('✗ The platform rejected the version:');
    for (const e of upload.errors ?? []) console.error(`  - ${e}`);
    process.exit(1);
  }
  for (const w of upload.warnings ?? []) console.log(`  ⚠ ${w}`);
  console.log(`✓ Version ${upload.version} uploaded and validated.`);

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
