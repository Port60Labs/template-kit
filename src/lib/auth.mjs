import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

/**
 * The kit's sign-in plumbing (developer CLI stream A, docs/developer-cli-and-ci-publishing.md).
 * The OAuth Device Authorization Grant against the platform's customer realm: the BROWSER does
 * the actual sign-in (so passwordless email codes and Google both work unchanged), the terminal
 * only ever holds the resulting tokens. The refresh token is an offline token, stored 0600 in
 * ~/.port60/credentials.json and revocable from the account's sessions at any time.
 */

const STORE_DIR = join(homedir(), '.port60');
const STORE_FILE = join(STORE_DIR, 'credentials.json');

export const authBase = () => (process.env.P60_AUTH_BASE || 'https://auth.port60.com').replace(/\/+$/, '');
export const authRealm = () => process.env.P60_REALM || 'port60-customers';
export const apiBase = () => (process.env.P60_API_BASE || 'https://api.port60.com').replace(/\/+$/, '');
export const oauthClientId = () => process.env.P60_CLIENT_ID || 'port60-kit';

const tokenUrl = (base, realm) => `${base}/realms/${realm}/protocol/openid-connect/token`;

export function loadCredentials() {
  try {
    return JSON.parse(readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function saveCredentials(creds) {
  mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(STORE_FILE, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 });
  chmodSync(STORE_FILE, 0o600); // writeFileSync mode is ignored when the file already exists
}

export function clearCredentials() {
  rmSync(STORE_FILE, { force: true });
}

export function requireCredentials() {
  const creds = loadCredentials();
  if (!creds?.refreshToken) {
    console.error('✗ Not signed in. Run: p60-template-kit login');
    process.exit(1);
  }
  return creds;
}

/** The JWT payload, unverified — display only (email, subject). The server verifies for real. */
export function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

async function form(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON error page; the status carries the story
  }
  return { ok: res.ok, status: res.status, body };
}

/** A fresh access token from the stored offline token; rotates the stored refresh token when the
 *  server hands a new one back. */
export async function accessToken(creds) {
  const { ok, status, body } = await form(tokenUrl(creds.authBase, creds.realm), {
    grant_type: 'refresh_token',
    client_id: creds.clientId,
    refresh_token: creds.refreshToken
  });
  if (!ok) {
    console.error(`✗ Your sign-in is no longer valid (${body.error ?? status}). Run: p60-template-kit login`);
    process.exit(1);
  }
  if (body.refresh_token && body.refresh_token !== creds.refreshToken) {
    saveCredentials({ ...creds, refreshToken: body.refresh_token });
  }
  return body.access_token;
}

function tryOpenBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
  } catch {
    // no browser to open; the printed URL is the path
  }
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/**
 * The device flow itself: ask for a code, hand the human to the browser, poll until the sign-in
 * completes. Returns {accessToken, refreshToken}.
 */
export async function deviceLogin() {
  const base = authBase();
  const realm = authRealm();
  const clientId = oauthClientId();
  // prompt=login forces a fresh, intentional sign-in at the verification page even when the
  // browser already holds an SSO session — so a developer who is also signed in as (say) a charity
  // editor can never silently authorise the CLI as the wrong account. Login is rare (the offline
  // token lasts), so paying for intentionality every time is the right trade.
  const start = await form(`${base}/realms/${realm}/protocol/openid-connect/auth/device`, {
    client_id: clientId,
    scope: 'openid offline_access',
    prompt: 'login'
  });
  if (!start.ok) {
    console.error(`✗ Could not start the sign-in (${start.body.error_description ?? start.body.error ?? start.status}).`);
    if (start.status === 404 || start.body.error === 'invalid_client') {
      console.error('  The sign-in service may not have the CLI client enabled yet.');
    }
    process.exit(1);
  }
  const { device_code: deviceCode, user_code: userCode, verification_uri: uri,
    verification_uri_complete: uriComplete, interval = 5, expires_in: expiresIn = 600 } = start.body;

  console.log('');
  console.log(`  Visit:  ${uri}`);
  console.log(`  Code:   ${userCode}`);
  console.log('');
  console.log('  Sign in there with the account you want to PUBLISH AS — you will be asked to sign in');
  console.log('  even if your browser is already logged in, so pick the right one. This terminal will notice.');
  if (uriComplete) tryOpenBrowser(uriComplete);

  const deadline = Date.now() + expiresIn * 1000;
  let waitSeconds = interval;
  while (Date.now() < deadline) {
    await sleep(waitSeconds);
    const poll = await form(tokenUrl(base, realm), {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: deviceCode
    });
    if (poll.ok) {
      return { accessToken: poll.body.access_token, refreshToken: poll.body.refresh_token };
    }
    switch (poll.body.error) {
      case 'authorization_pending':
        break;
      case 'slow_down':
        waitSeconds += 5;
        break;
      case 'access_denied':
        console.error('✗ The sign-in was declined in the browser.');
        process.exit(1);
        break;
      case 'expired_token':
        console.error('✗ The code expired before the sign-in completed. Run login again.');
        process.exit(1);
        break;
      default:
        console.error(`✗ Sign-in failed (${poll.body.error_description ?? poll.body.error ?? poll.status}).`);
        process.exit(1);
    }
  }
  console.error('✗ The code expired before the sign-in completed. Run login again.');
  process.exit(1);
}

/** Best-effort server-side revocation of the offline token; local removal always follows. */
export async function revoke(creds) {
  try {
    await form(`${creds.authBase}/realms/${creds.realm}/protocol/openid-connect/logout`, {
      client_id: creds.clientId,
      refresh_token: creds.refreshToken
    });
  } catch {
    // unreachable server; the local removal still signs this machine out
  }
}

/** An authenticated platform-API call. */
export async function api(creds, token, path, init = {}) {
  const res = await fetch(`${creds.apiBase}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
  return res;
}
