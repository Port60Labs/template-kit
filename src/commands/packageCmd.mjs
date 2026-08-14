import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateArtifact } from '../vendor/validator/validate.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';
import { buildZip } from '../lib/zip.mjs';

/**
 * `package <dir>`, validate first (the platform will run the identical checks, so failing here
 * saves the round trip), then zip EXACTLY the contract-shaped file set into
 * `<name>-<version>.zip`, the artifact the studio's upload lane accepts as-is.
 */
export async function packageCmd(args) {
  const dir = resolve(args._[0] ?? '.');
  const files = loadArtifactDir(dir);
  const { errors, manifest } = await validateArtifact(files);
  if (errors.length > 0) {
    console.error(`✗ not packaging, ${errors.length} validation error${errors.length === 1 ? '' : 's'}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const out = join(dir, `${manifest.name}-${manifest.version}.zip`);
  writeFileSync(out, buildZip(Object.entries(files).map(([path, content]) => ({ path, content }))));
  console.log(`✓ ${out}`);
  console.log('  Upload it from your studio (tenant admin → Studio → your template → Versions).');
}
