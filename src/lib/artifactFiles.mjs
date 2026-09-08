// The contract-shaped file set of an artifact directory, the same selection the platform's
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

// What the artifact rules leave behind. A photograph, a font or a script dropped next to the
// renderers is the classic surprise: it may even show in a local page, then the zip and the upload
// carry nothing of it. `package` and `publish` print this list so the author learns it from the
// kit, not from a broken URL on a live site. Project files that legitimately live beside a
// template (README, package.json, node_modules, dist, preview content, design notes) are not
// reported; only the three artifact folders and top-level binaries are.
const ACCEPTED = { sections: /\.liquid$/, pages: /\.liquid$/, assets: /\.css$/ };
const TOP_LEVEL_BINARY = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|m4a|js|mjs|cjs|ts)$/i;

export function listSkippedFiles(root) {
  const skipped = [];
  const walk = (dir, rel, accept, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), path, accept, depth + 1);
      // Only the folder's own files are read; anything nested is left out whatever its name.
      else if (depth > 0 || !accept.test(entry.name)) skipped.push(path);
    }
  };
  for (const [dir, accept] of Object.entries(ACCEPTED)) {
    if (existsSync(join(root, dir))) walk(join(root, dir), dir, accept, 0);
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && TOP_LEVEL_BINARY.test(entry.name)) skipped.push(entry.name);
  }
  return skipped.sort();
}

/** The lines `package`/`publish` print under the result when something was left out; empty otherwise. */
export function skippedNotice(root) {
  const skipped = listSkippedFiles(root);
  if (skipped.length === 0) return [];
  return [
    `  left out (not part of a template): ${skipped.join(', ')}`,
    '  Templates ship Liquid and CSS only; photographs belong in the charity\'s media library.',
    '  See https://developers.port60.com/guides/publishing/#what-the-zip-contains'
  ];
}
