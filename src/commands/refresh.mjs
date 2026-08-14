import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { agentsMd } from '../lib/agentsMd.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';
import { validateArtifact } from '../vendor/validator/validate.mjs';
import { contentModel } from '../vendor/engine/content-footprint.mjs';
import dialect from '../vendor/contract/v1/dialect.json' with { type: 'json' };

const KIT_PACKAGE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
);

/**
 * `refresh [dir]`, regenerate the GENERATED files against the installed kit and report where the
 * template stands. Rewrites AGENTS.md and CLAUDE.md (they are the kit's briefing, generated at
 * create time and stale the moment the contract moves, your own notes belong in README.md),
 * prints the versions in force, and runs the full conformance check so an upgrade immediately
 * shows what, if anything, the newer contract asks of you. Template sources are never touched.
 */
export async function refresh(args) {
  const dir = resolve(args._[0] ?? '.');
  const files = loadArtifactDir(dir);
  if (!files['manifest.json']) {
    console.error(`✗ ${dir} does not contain a template (no manifest.json).`);
    process.exit(1);
  }
  const manifest = JSON.parse(files['manifest.json']);

  const briefing = agentsMd(manifest.name);
  writeFileSync(join(dir, 'AGENTS.md'), briefing);
  writeFileSync(join(dir, 'CLAUDE.md'), briefing);

  console.log(`✓ kit ${KIT_PACKAGE.version} · contract ${dialect.format} · content model ${contentModel.version}`);
  console.log('✓ AGENTS.md and CLAUDE.md regenerated for this contract');

  const { errors, warnings, contentFootprint, minContentVersion } = await validateArtifact(files);
  if (contentFootprint?.length) {
    console.log(`  content footprint: ${contentFootprint.join(', ')}`
        + (minContentVersion ? ` (minimum model ${minContentVersion})` : ''));
  }
  if (errors.length === 0) {
    console.log(`✓ ${manifest.name}@${manifest.version} conforms${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}, nothing to change.`);
  } else {
    console.log(`✗ the current contract asks ${errors.length} thing${errors.length === 1 ? '' : 's'} of this template:`);
    for (const e of errors) console.log(`    - ${e}`);
    process.exitCode = 1;
  }
}
