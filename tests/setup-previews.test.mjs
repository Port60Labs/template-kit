import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { previewSetupCommand } from '../src/commands/setupPreviews.mjs';

test('preview setup resolves the installed Playwright binary and forwards Linux setup explicitly', () => {
  const command = previewSetupCommand();
  assert.deepEqual(command.slice(1), ['install', 'chromium', '--only-shell']);
  assert.deepEqual(previewSetupCommand({ 'with-deps': true }), [...command, '--with-deps']);
  // Exercise the actual binary without downloads, system changes or a preinstalled browser.
  const result = spawnSync(process.execPath, [command[0], '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const require = createRequire(import.meta.url);
  assert.equal(result.stdout.trim(), `Version ${require('playwright/package.json').version}`);
});
