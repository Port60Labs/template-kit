import { createInterface } from 'node:readline/promises';
import {
  accessToken, api, apiBase, authBase, authRealm, clearCredentials, decodeJwtPayload,
  deviceLogin, loadCredentials, oauthClientId, requireCredentials, revoke, saveCredentials
} from '../lib/auth.mjs';

/**
 * `login` / `logout` / `whoami` (developer CLI stream A). Login runs the device flow, then finds
 * the developer's STUDIO workspace: memberships are product-blind, so the studio is discovered by
 * probing the studio surface itself (the gateway's entitlement gate refuses non-studio workspaces,
 * which is exactly the discriminator). One membership skips the ceremony; ambiguity asks once and
 * the choice is remembered.
 */

async function studioProbe(creds, token, tenantId) {
  try {
    const res = await api(creds, token, `/api/admin/studio/tenants/${tenantId}/studio/status`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function login() {
  const { accessToken: access, refreshToken } = await deviceLogin();
  if (!refreshToken) {
    console.error('✗ The sign-in completed but returned no offline token. Is offline_access enabled on the CLI client?');
    process.exit(1);
  }
  const claims = decodeJwtPayload(access);
  const creds = {
    authBase: authBase(),
    realm: authRealm(),
    clientId: oauthClientId(),
    apiBase: apiBase(),
    refreshToken,
    email: claims.email ?? null
  };

  const res = await api(creds, access, '/api/me/memberships');
  if (!res.ok) {
    console.error(`✗ Signed in, but the workspace list could not be read (${res.status}).`);
    process.exit(1);
  }
  const memberships = await res.json();
  if (memberships.length === 0) {
    console.error('✗ This account has no workspaces. Create a developer account at https://port60.com/developers/ first.');
    process.exit(1);
  }

  let workspace = null;
  if (memberships.length === 1) {
    workspace = memberships[0];
  } else {
    const probes = await Promise.all(
      memberships.map(async (m) => ((await studioProbe(creds, access, m.tenantId)) ? m : null))
    );
    const studios = probes.filter(Boolean);
    if (studios.length === 1) {
      workspace = studios[0];
    } else {
      const candidates = studios.length > 0 ? studios : memberships;
      console.log('\n  Your workspaces:');
      candidates.forEach((m, i) => console.log(`    ${i + 1}. ${m.workspaceName}`));
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question('  Which one is your template studio? ');
      rl.close();
      workspace = candidates[Number(answer) - 1];
      if (!workspace) {
        console.error('✗ No such option. Run login again.');
        process.exit(1);
      }
    }
  }

  saveCredentials({ ...creds, workspace: { tenantId: workspace.tenantId, name: workspace.workspaceName } });
  console.log('');
  console.log(`✓ Signed in${creds.email ? ` as ${creds.email}` : ''}.`);
  console.log(`  Studio workspace: ${workspace.workspaceName}`);
  console.log('  Not the account you meant? Run: p60-template-kit logout, then login again.');
  console.log('  Publish from a template directory with: p60-template-kit publish');
}

export async function whoami() {
  const creds = requireCredentials();
  const token = await accessToken(creds);
  const claims = decodeJwtPayload(token);
  console.log(`Signed in as ${claims.email ?? creds.email ?? claims.sub}`);
  console.log(`Studio workspace: ${creds.workspace?.name ?? '(none chosen)'}`);
  console.log(`Platform API: ${creds.apiBase}`);
}

export async function logout() {
  const creds = loadCredentials();
  if (!creds) {
    console.log('Not signed in.');
    return;
  }
  await revoke(creds);
  clearCredentials();
  console.log('✓ Signed out; this machine\'s token has been revoked.');
}
