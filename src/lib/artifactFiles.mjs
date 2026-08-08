// The contract-shaped file set of an artifact directory — the same selection the platform's
// upload intake allow-lists: manifest, layout, section/page renderers, css assets. Anything else
// in the directory is not part of an artifact and is neither validated nor packaged.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadArtifactDir(root) {
  const files = {};
  const add = (rel) => {
    const abs = join(root, rel);
    if (existsSync(abs)) files[rel] = readFileSync(abs, 'utf8');
  };
  add('manifest.json');
  add('layout.liquid');
  for (const dir of ['sections', 'pages']) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (name.endsWith('.liquid')) files[`${dir}/${name}`] = readFileSync(join(abs, name), 'utf8');
    }
  }
  if (existsSync(join(root, 'assets'))) {
    for (const name of readdirSync(join(root, 'assets'))) {
      if (name.endsWith('.css')) files[`assets/${name}`] = readFileSync(join(root, 'assets', name), 'utf8');
    }
  }
  return files;
}
