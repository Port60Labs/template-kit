// The dev preview's request-level options (lib/previewOptions.mjs): routing, knob overrides from
// the query, and the preview/ folder's file serving rules, tested without a server. Plus the
// content eject: it now carries the menu and the page compositions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { surfaceFor, knobOverridesFromQuery, previewAssetPath, previewAssetType } from '../src/lib/previewOptions.mjs';

const CLI = resolve(import.meta.dirname, '../bin/cli.mjs');

test('routing: /about is its own surface, unknown paths are home', () => {
  assert.equal(surfaceFor('/about'), 'about');
  assert.equal(surfaceFor('/about/'), 'about');
  assert.equal(surfaceFor('/'), 'home');
  assert.equal(surfaceFor('/whatever'), 'home');
  assert.equal(surfaceFor('/events?event=x'), 'event');
});

test('knobs from the query: a Look is a bundle, a single knob wins over it, unknown names are ignored', () => {
  const manifest = {
    settings: { schema: [{ key: 'scheme', kind: 'select', options: ['A', 'B'] }, { key: 'width', kind: 'select', options: ['Wide', 'Focused'] }] },
    looks: [{ name: 'Bold', values: { scheme: 'B', width: 'Wide' } }]
  };
  assert.deepEqual(knobOverridesFromQuery(manifest, new URLSearchParams('')), { knobs: {}, look: null });
  assert.deepEqual(knobOverridesFromQuery(manifest, new URLSearchParams('look=Bold')), { knobs: { scheme: 'B', width: 'Wide' }, look: 'Bold' });
  assert.deepEqual(knobOverridesFromQuery(manifest, new URLSearchParams('look=Bold&p60s-width=Focused')), { knobs: { scheme: 'B', width: 'Focused' }, look: 'Bold' });
  assert.deepEqual(knobOverridesFromQuery(manifest, new URLSearchParams('look=Nope&p60s-other=1&p60s-scheme=A')), { knobs: { scheme: 'A' }, look: null });
});

test('preview folder: only image files inside preview/ are served; traversal and other types are refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p60prev-'));
  mkdirSync(join(dir, 'preview'));
  writeFileSync(join(dir, 'preview', 'hero.jpg'), 'jpg');
  writeFileSync(join(dir, 'preview', 'notes.txt'), 'no');
  writeFileSync(join(dir, 'secret.png'), 'outside');
  assert.equal(previewAssetPath(dir, '/preview/hero.jpg'), join(dir, 'preview', 'hero.jpg'));
  assert.equal(previewAssetType(join(dir, 'preview', 'hero.jpg')), 'image/jpeg');
  assert.equal(previewAssetPath(dir, '/preview/notes.txt'), null, 'not an image');
  assert.equal(previewAssetPath(dir, '/preview/missing.png'), null);
  assert.equal(previewAssetPath(dir, '/preview/../secret.png'), null, 'no escaping the folder');
  assert.equal(previewAssetPath(dir, '/preview/%2e%2e/secret.png'), null);
  assert.equal(previewAssetPath(dir, '/other/hero.jpg'), null);
});

test('content eject carries the menu and the page compositions beside the collections', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'p60kit-')), 'eject-theme');
  execFileSync(process.execPath, [CLI, 'create', dir, '--name', 'eject-theme', '--label', 'Eject'], { encoding: 'utf8' });
  execFileSync(process.execPath, [CLI, 'content', dir], { encoding: 'utf8' });
  const data = JSON.parse(readFileSync(join(dir, 'preview-content.json'), 'utf8'));
  assert.ok(Array.isArray(data.nav.items) && data.nav.items.length > 0);
  assert.ok(Array.isArray(data.pages.home) && data.pages.home.some((s) => s.type === 'homeHero'));
  assert.ok(Array.isArray(data.pages.about) && data.pages.about.some((s) => s.type === 'values'));
  assert.ok(data.pages.home.every((s) => s.content && typeof s.content === 'object'), 'each section ejects with its copy');
  assert.equal(data.about, undefined, 'about itself is derived, never ejected');
  assert.ok(Array.isArray(data.events));
});
