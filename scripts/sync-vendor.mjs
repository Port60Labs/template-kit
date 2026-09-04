#!/usr/bin/env node
// Vendors the platform contract + engine + validator from charity-site (the ONE authoritative
// copy) into this package, preserving the relative layout so the modules' own imports work
// verbatim. Run after any contract/engine change; the drift-guard test fails the build if the
// vendored copy and the source disagree.
import { cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SITE = resolve(import.meta.dirname, '../../../frontends/charity-site');
const VENDOR = resolve(import.meta.dirname, '../src/vendor');

rmSync(VENDOR, { recursive: true, force: true });
mkdirSync(join(VENDOR, 'engine'), { recursive: true });
cpSync(join(SITE, 'src/templates/contract'), join(VENDOR, 'contract'), { recursive: true });
for (const f of ['dialect.mjs', 'budgets.mjs', 'content-footprint.mjs']) {
  cpSync(join(SITE, 'src/templates/engine', f), join(VENDOR, 'engine', f));
}
cpSync(join(SITE, 'src/templates/validator'), join(VENDOR, 'validator'), { recursive: true });

// The starter artifact IS the scaffold source. Source dirs are now VERSIONLESS (the version lives
// in the manifest, per the versionless-template-dirs change), so copy the dir directly.
const starterRoot = join(SITE, 'template-artifacts/starter');
const STARTER_OUT = resolve(import.meta.dirname, '../starter');
rmSync(STARTER_OUT, { recursive: true, force: true });
cpSync(starterRoot, STARTER_OUT, { recursive: true });

const { version } = JSON.parse(readFileSync(join(starterRoot, 'manifest.json'), 'utf8'));
console.log(`vendored contract/engine/validator + starter ${version}`);
