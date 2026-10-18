import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadArtifactDir } from '../src/lib/artifactFiles.mjs';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';
import { agentsMd } from '../src/lib/agentsMd.mjs';

test('the scaffold presents biographies as complete escaped paragraphs rather than quotations', async () => {
  const files = loadArtifactDir(resolve(import.meta.dirname, '../starter'));
  const statement = `First paragraph.\n\n<script>alert("never")</script>\n${'Longword'.repeat(200)}`;
  const html = await renderStudioPreview(files, { surface: 'about', previewContent: { pages: { about: [
    { key: 'team', type: 'people', content: { heading: 'Our team', items: [{ name: 'Person', role: 'Trustee', statement }] } }
  ] } } });
  assert.match(html, /data-p60-field="items\.0\.statement">First paragraph\.\n\n&lt;script&gt;/);
  assert.ok(html.includes('Longword'.repeat(200)), 'older biographies are never silently clipped');
  assert.doesNotMatch(html, /<script>alert|“First paragraph/);
  const rule = files['assets/theme.css'].match(/\.lq-person-statement\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(rule, /white-space:\s*pre-line/);
  assert.match(rule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule, /italic|line-clamp|max-height/);
});

test('scaffold guidance and the vendored contract describe the biography boundary', () => {
  assert.match(agentsMd('test'), /200 UTF-16 characters/);
  const bounds = JSON.parse(readFileSync(resolve(import.meta.dirname, '../src/vendor/contract/v2/content-bounds.json'), 'utf8'));
  assert.equal(bounds.groups.flatMap(group => group.fields).find(field => field.field === 'people.items[].statement').max, 200);
});
