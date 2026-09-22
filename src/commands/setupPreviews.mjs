import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

export function previewSetupCommand(args = {}) {
  const require = createRequire(import.meta.url);
  // Playwright exports its manifest, not a ./cli module. Use its declared binary so
  // this resolves the kit's pinned installation even inside another npm project.
  const manifestPath = require.resolve('playwright/package.json');
  const command = [resolve(dirname(manifestPath), require(manifestPath).bin.playwright), 'install', 'chromium', '--only-shell'];
  if (args['with-deps']) command.push('--with-deps');
  return command;
}

export function setupPreviews(args) {
  const result = spawnSync(process.execPath, previewSetupCommand(args), { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
