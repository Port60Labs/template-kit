import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(import.meta.dirname, '../bin/cli.mjs');

function freePort() {
  return new Promise((done) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

function startDev(dir, extra) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [CLI, 'dev', dir, ...extra], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); fail(new Error(`dev did not start: ${output}`)); }, 20_000);
    const collect = (chunk) => {
      output += chunk;
      if (output.includes('watching for changes')) {
        clearTimeout(timer);
        done({ child, output });
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
  });
}

test('dev listens on the loopback address by default and answers there', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p60kit-dev-bind-'));
  execFileSync(process.execPath, [CLI, 'create', dir, '--name', 'bind-check'], { encoding: 'utf8' });
  const port = await freePort();
  const { child, output } = await startDev(dir, ['--port', String(port)]);
  try {
    assert.match(output, new RegExp(`preview at http://localhost:${port}`));
    assert.doesNotMatch(output, /other devices on the network/);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--host opens the preview to the network and says so', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p60kit-dev-host-'));
  execFileSync(process.execPath, [CLI, 'create', dir, '--name', 'host-check'], { encoding: 'utf8' });
  const port = await freePort();
  const { child, output } = await startDev(dir, ['--port', String(port), '--host', '0.0.0.0']);
  try {
    assert.match(output, /listening on 0\.0\.0\.0, so other devices on the network can reach this preview/);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--host without an address is refused with a hint instead of a silent loopback bind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p60kit-dev-bind-'));
  execFileSync(process.execPath, [CLI, 'create', dir, '--name', 'bind-check'], { encoding: 'utf8' });
  try {
    const bare = spawnSync(process.execPath, [CLI, 'dev', dir, '--host'], { encoding: 'utf8' });
    assert.equal(bare.status, 1);
    assert.match(bare.stderr, /--host needs an address/);
    const joined = spawnSync(process.execPath, [CLI, 'dev', dir, '--host=0.0.0.0'], { encoding: 'utf8' });
    assert.equal(joined.status, 1);
    assert.match(joined.stderr, /--host 0\.0\.0\.0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
