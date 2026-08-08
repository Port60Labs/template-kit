import { resolve } from 'node:path';
import { validateArtifact } from '../vendor/validator/validate.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';

/**
 * `validate <dir> [--json]` — the exact checks the platform runs at upload, plus the T3 promise:
 * **supports as an OUTPUT**. On a clean pass the manifest's supports block IS the proven set —
 * the validator's two-way honesty checks (declared ⇒ renders the fixture, renders ⇒ declared)
 * are what turn a declaration into proof. `--json` is the AI agent's feedback loop: iterate
 * until {ok: true}.
 */
export async function validate(args) {
  const dir = args._[0] ?? '.';
  const files = loadArtifactDir(resolve(dir));
  const { errors, warnings, manifest } = await validateArtifact(files);
  const ok = errors.length === 0;

  if (args.json) {
    console.log(JSON.stringify({
      ok,
      errors,
      warnings,
      manifest: manifest == null ? null : { name: manifest.name, version: manifest.version },
      // Proven by behaviour, not claimed: only a clean pass earns the supports set.
      provenSupports: ok ? manifest.supports : null
    }, null, 2));
    process.exit(ok ? 0 : 1);
  }

  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  if (!ok) {
    console.error(`\n✗ ${manifest?.name ?? dir} FAILED conformance (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`\n✓ ${manifest.name}@${manifest.version} conforms to ${manifest.format}`);
  console.log(`  proven supports: ${JSON.stringify(manifest.supports)}`);
}
