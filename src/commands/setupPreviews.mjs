import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

export function setupPreviews(args) {
  const require = createRequire(import.meta.url);
  const command = ['install', 'chromium', '--only-shell'];
  if (args['with-deps']) command.push('--with-deps');
  const result = spawnSync(process.execPath, [require.resolve('playwright/cli'), ...command], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
