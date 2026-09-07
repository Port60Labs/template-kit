// `publish --ci` against a stand-in platform: the CLI must fetch GitHub's OIDC token for the
// platform's audience, post the packaged archive with it, and report the outcome. No real
// network: a local node:http server plays both GitHub's token endpoint and api.port60.com.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(import.meta.dirname, '../bin/cli.mjs');

// ASYNC, unlike kit.test.mjs's runner: the stand-in server lives in this process, and a blocking
// execFileSync would freeze the event loop it needs to answer the CLI.
function run(args, env) {
  return new Promise((done) => {
    execFile(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } },
      (error, stdout, stderr) => done({ code: error ? error.code : 0, out: `${stdout ?? ''}${stderr ?? ''}` }));
  });
}

function standIn(handler) {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => handler(req, Buffer.concat(chunks), res));
    });
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

test('publish --ci: OIDC token for the platform audience, archive posted, outcome printed', async () => {
  const seen = { tokenAuth: null, audience: null, bearer: null, contentType: null, bodyBytes: 0, submit: null };
  const { server, port } = await standIn((req, body, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/token') {
      seen.tokenAuth = req.headers.authorization;
      seen.audience = url.searchParams.get('audience');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ value: 'oidc-from-github' }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/public/studio/ci/publish') {
      seen.bearer = req.headers.authorization;
      seen.contentType = req.headers['content-type'];
      seen.bodyBytes = body.length;
      seen.submit = url.searchParams.get('submit');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        templateName: 'ci-theme', templateLabel: 'CI Theme', templateCreated: true,
        repository: 'acme/ci-theme', ref: 'refs/tags/v1.0.0', submitted: true,
        upload: { accepted: true, version: '1.0.0', status: 'SUBMITTED', errors: [], warnings: ['one warning'] }
      }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const dir = join(mkdtempSync(join(tmpdir(), 'p60kit-ci-')), 'ci-theme');
  try {
    execFileSync(process.execPath, [CLI, 'create', dir, '--name', 'ci-theme'], { encoding: 'utf8' });
    const { code, out } = await run(['publish', '--ci', dir], {
      GITHUB_ACTIONS: 'true',
      ACTIONS_ID_TOKEN_REQUEST_URL: `http://127.0.0.1:${port}/token?api-version=2.0`,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token',
      P60_API_BASE: `http://127.0.0.1:${port}`
    });
    assert.equal(code, 0, out);
    assert.equal(seen.tokenAuth, 'Bearer request-token');
    assert.equal(seen.audience, 'port60-studio-ci');
    assert.equal(seen.bearer, 'Bearer oidc-from-github');
    assert.equal(seen.contentType, 'application/zip');
    assert.ok(seen.bodyBytes > 100, 'the archive was posted');
    assert.equal(seen.submit, 'true');
    assert.match(out, /uploading from CI/);
    assert.match(out, /CI Theme created from its manifest/);
    assert.match(out, /one warning/);
    assert.match(out, /Version 1\.0\.0 uploaded and validated/);
    assert.match(out, /Submitted for review/);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publish --ci: a refusal from the platform is explained and fails the job', async () => {
  const { server, port } = await standIn((req, body, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/token') {
      res.end(JSON.stringify({ value: 't' }));
      return;
    }
    res.statusCode = 403;
    res.setHeader('content-type', 'application/problem+json');
    res.end(JSON.stringify({ message: 'No studio trusts acme/ci-theme.' }));
  });
  const dir = join(mkdtempSync(join(tmpdir(), 'p60kit-ci-')), 'ci-theme');
  try {
    execFileSync(process.execPath, [CLI, 'create', dir, '--name', 'ci-theme'], { encoding: 'utf8' });
    const { code, out } = await run(['publish', '--ci', dir, '--no-submit'], {
      ACTIONS_ID_TOKEN_REQUEST_URL: `http://127.0.0.1:${port}/token`,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'r',
      P60_API_BASE: `http://127.0.0.1:${port}`
    });
    assert.equal(code, 1);
    assert.match(out, /Publish refused \(403\): No studio trusts acme\/ci-theme/);
    assert.match(out, /Automate in your studio/);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publish --ci outside Actions explains the id-token permission', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'p60kit-ci-')), 'ci-theme');
  try {
    execFileSync(process.execPath, [CLI, 'create', dir, '--name', 'ci-theme'], { encoding: 'utf8' });
    const { code, out } = await run(['publish', '--ci', dir], { ACTIONS_ID_TOKEN_REQUEST_URL: '', ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' });
    assert.equal(code, 1);
    assert.match(out, /id-token: write/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
