import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSiteFixture, composePage, validatePreviewContent } from '../vendor/validator/site-context.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';

/**
 * `content [dir] [--out file] [--force]`, EJECT the content model's data as your hard copy.
 * Writes every overridable `site.content.*` collection, fully populated with the canonical
 * organisation's data, as one editable JSON file. Replace the copy, swap the imagery for your
 * own URLs, then hand it back:
 *
 *   p60-template-kit content .                 → writes ./preview-content.json
 *   p60-template-kit dev . --content my.json   → the preview renders YOUR data
 *
 * The shape stays the platform's (schema-checked on every read, a field that does not exist in
 * production cannot exist in a preview); the data becomes yours. The menu ejects as `nav`, and
 * the home and about compositions eject as `pages` (each declared section the catalogue assigns
 * to that page, with its sample copy), so section copy is edited in place; `about` itself is not
 * ejected, it is derived from the page being previewed.
 */
export function content(args) {
  const dir = resolve(args._[0] ?? '.');
  const out = resolve(dir, typeof args.out === 'string' ? args.out : 'preview-content.json');
  if (existsSync(out) && !args.force) {
    console.error(`✗ ${out} already exists, pass --force to overwrite it.`);
    process.exit(1);
  }
  const site = buildSiteFixture(null);
  let manifest = null;
  try {
    manifest = JSON.parse(loadArtifactDir(dir)['manifest.json'] ?? 'null');
  } catch {
    // no manifest here: collections and brand still eject, the compositions need one
  }
  const data = {
    brand: site.brand,
    nav: { items: site.nav?.items ?? [] },
    ...(manifest ? { pages: { home: composePage(manifest, 'home'), about: composePage(manifest, 'about') } } : {}),
    ...Object.fromEntries(Object.entries(site.content).filter(([name]) => name !== 'about'))
  };
  const problems = validatePreviewContent(data);
  if (problems.length > 0) {
    // The eject is generated FROM the model, so this firing means the kit itself is broken.
    console.error('✗ internal error, the ejected content does not validate:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ content model data written to ${out}`);
  console.log('  Edit the copy (pages carry each section, nav the menu), point imageUrl values at your own hosted images or a preview/ folder beside the template (/preview/<file>), then:');
  console.log(`    p60-template-kit dev ${args._[0] ?? '.'} --content ${typeof args.out === 'string' ? args.out : 'preview-content.json'}`);
  console.log('  Shape is fixed (schema-checked every read); the data is yours. Never packaged.');
}
