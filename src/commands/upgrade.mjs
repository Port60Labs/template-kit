import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * `upgrade [dir]`, bring an EXISTING template onto the latest kit and contract. The scaffold
 * pins the kit as a devDependency and every script runs the local copy, so the whole enforcement
 * surface (contract, content model, validator, preview, behaviour runtime) upgrades with one
 * install; this command does that install and then hands over to the FRESHLY INSTALLED kit's
 * `refresh` to regenerate the agent briefing and report what the new contract thinks of your
 * template. Your template sources are never touched, only the generated briefing files.
 *
 * Run it as `npx @port60/template-kit@latest upgrade` (or `p60-template-kit upgrade` from an
 * installed copy, the delegation makes either safe).
 */
export function upgrade(args) {
  const dir = resolve(args._[0] ?? '.');
  if (!existsSync(join(dir, 'manifest.json'))) {
    console.error(`✗ ${dir} does not contain a template (no manifest.json).`);
    process.exit(1);
  }
  if (!existsSync(join(dir, 'package.json'))) {
    console.error(`✗ ${dir} has no package.json, scaffolds created by this kit pin it as a devDependency.`);
    console.error('  Add it yourself: npm init -y && npm install --save-dev @port60/template-kit@latest');
    process.exit(1);
  }

  console.log('▸ installing the latest kit…');
  const install = spawnSync('npm', ['install', '--save-dev', '@port60/template-kit@latest'],
      { cwd: dir, stdio: 'inherit' });
  if (install.status !== 0) {
    console.error('✗ npm install failed, nothing else was changed.');
    process.exit(install.status ?? 1);
  }

  // The refresh must run on the NEW version (this process may be an older one).
  const localCli = join(dir, 'node_modules', '@port60', 'template-kit', 'bin', 'cli.mjs');
  const refresh = spawnSync(process.execPath, [localCli, 'refresh', dir], { stdio: 'inherit' });
  if (refresh.status !== 0) {
    // An older kit without `refresh` (or a refresh failure): the install still happened.
    console.log('✓ kit upgraded. This version has no refresh step, run `npm run validate` to see');
    console.log('  what the new contract thinks of your template.');
  }
}
