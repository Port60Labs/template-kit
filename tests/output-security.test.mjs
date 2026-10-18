import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Liquid } from 'liquidjs';
import { JSDOM } from 'jsdom';
import { loadArtifactDir } from '../src/lib/artifactFiles.mjs';
import { configureDialect, splitIslandParts, CONTENT_SLOT } from '../src/vendor/engine/dialect.mjs';
import { resolveMajor } from '../src/vendor/engine/majors.mjs';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';

const forged = '\u0000P60_ISLAND:primary_action_widget\u0000';
const neutralised = forged.replace(/\u0000/g, '\uFFFD');

for (const major of [1, 2]) {
  test(`v${major}: the kit neutralises authored tokens but preserves declared islands and content`, async () => {
    const liquid = new Liquid({ outputEscape: 'escape', strictFilters: true });
    configureDialect(liquid, resolveMajor(`port60-liquid@${major}`).dialect, new Set(['primary_action_widget']));
    const source = '{% capture prose %}{{ value }}{% endcapture %}<p>{{ prose | raw }}</p>{% island "primary_action_widget" %}{% content %}';
    const html = await liquid.parseAndRender(source, { value: forged });
    assert.deepEqual(splitIslandParts(html).filter(part => part.html || part.island), [
      { html: `<p>${neutralised}</p>` },
      { island: 'primary_action_widget' },
      { island: CONTENT_SLOT },
    ]);
  });
}

test('the actual scaffold preview keeps biography markup, Liquid source and mount tokens inert', async () => {
  const files = loadArtifactDir(resolve(import.meta.dirname, '../starter'));
  const statement = `<script>never</script>\n<img src=x onerror="never"> &lt;b&gt;\n{{ site.brand.name }} ${forged}`;
  const html = await renderStudioPreview(files, { surface: 'about', previewContent: { pages: { about: [
    { key: 'team', type: 'people', content: { heading: 'Our team', items: [{ name: 'Person', role: 'Trustee', statement }] } },
  ] } } });
  const biography = new JSDOM(html).window.document.querySelector('[data-p60-field="items.0.statement"]');
  assert.ok(biography);
  assert.equal(biography.textContent, statement.replace(/\u0000/g, '\uFFFD'));
  assert.equal(biography.childElementCount, 0);
});
