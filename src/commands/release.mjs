import { mkdirSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { buildReleaseBundle } from '../lib/releaseBundle.mjs';

export async function releaseCmd(args) {
  const root = resolve(args._[0] ?? '.');
  const bundle = await buildReleaseBundle(root);
  const output = join(root, 'dist', 'release', bundle.manifest.name, bundle.manifest.version);
  // Never follow a linked build destination or silently mix two builds of an immutable release.
  for (const dir of [join(root, 'dist'), join(root, 'dist', 'release'), join(root, 'dist', 'release', bundle.manifest.name), output]) {
    if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('Linked release destination refused');
  }
  if (existsSync(output)) throw new Error(`Release output already exists: ${output}. Review/remove that generated directory or bump the version before rebuilding.`);
  for (const [path, file] of Object.entries(bundle.files)) {
    const destination = join(output, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.bytes, { flag: 'wx' });
  }
  console.log(`Validated release: ${output}`);
  console.log('template/ is runtime only; preview/ is the independent designer gallery. Publish release.json last.');
  console.log('Studio package/publish still accepts the runtime ZIP; store release publication uses the first-party pipeline.');
}
