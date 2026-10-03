import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifact } from '../src/vendor/validator/validate.mjs';
import { withSectionPresentation } from '../src/vendor/engine/section-presentation.mjs';
import { colourRoles } from '../src/vendor/engine/colour-roles.mjs';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';
import registry from '../src/vendor/contract/v2/presentation.json' with { type: 'json' };

const choice = { options: ['standard', 'soft'], default: 'standard' };
const manifest = { name: 'colour-kit-proof', label: 'Colour kit proof', version: '1.0.0', format: 'port60-liquid@2',
  supports: { pages: ['about'], sections: ['hero'], islands: [], sectionPresentation: { hero: { colourTreatment: choice } } } };
const source = '<section class="story" data-p60-colour-treatment="{{ section.presentation.colourTreatment }}"><h1 data-p60-colour-role="text">{{ section.title }}</h1></section>';
const css = '.story[data-p60-colour-treatment="soft"] {background-color:var(--bg-tint);color:var(--ink)} .story[data-p60-colour-treatment="soft"] [data-p60-colour-role="text"] {color:var(--ink)}';
const files = { 'manifest.json': JSON.stringify(manifest), 'sections/hero.liquid': source, 'assets/theme.css': css };

test('published kit shape and validator share bounded colour choices, root coverage and reset semantics', async () => {
  assert.deepEqual(registry.controls.colourTreatment.address, ['presentation', 'colourTreatment']);
  assert.deepEqual((await validateArtifact(files)).errors, []);
  assert.deepEqual(withSectionPresentation({ presentation: { colourTreatment: 'soft' } }, 'hero', manifest), { presentation: { colourTreatment: 'soft' } });
  assert.deepEqual(withSectionPresentation({ presentation: { colourTreatment: 'contrast' } }, 'hero', manifest), {});
  assert.deepEqual(withSectionPresentation({}, 'hero', manifest), {});
  for (const styles of [css.replaceAll('.story', '.wrong-root'), css + '[data-p60-colour-treatment="soft"] {opacity:.3}',
    css.replaceAll('color:var(--ink)', 'color:var(--ink) !important'),
    css.replaceAll('color:var(--ink)', 'color:var(--ink) !\\69mportant'),
    css.replaceAll('[data-p60-colour-role="text"]', 'h1')]) {
    assert.ok((await validateArtifact({ ...files, 'assets/theme.css': styles })).errors.some(error => error.includes('colourTreatment')));
  }
  assert.ok((await validateArtifact({ ...files, 'sections/hero.liquid': source.replace('</section>', '\u0000P60_ISLAND:map\u0000</section>') })).errors.some(error => error.includes('colourTreatment')));
});

test('kit previews and validation share semantic rich-text decoration without changing saved content', async () => {
  const root = '.story[data-p60-colour-treatment="soft"]';
  const styles = `${css} ${root} [data-p60-colour-role="muted"] {color:var(--ink)}
${root} [data-p60-colour-role="link"] {color:var(--ink)}
${root} [data-p60-colour-role="link"]:hover {text-decoration-color:var(--ink)}
${root} [data-p60-colour-role="link"]:focus-visible {outline-color:var(--ink)}`;
  const richFiles = { ...files, 'assets/theme.css': styles,
    'sections/hero.liquid': source.replace('</section>', '<div>{{ section.bodyHtml | colour_roles | raw }}</div></section>') };
  assert.deepEqual((await validateArtifact(richFiles)).errors, []);
  const bodyHtml = '<p style="text-align:center">Our <a href="/about"><strong>story</strong></a>.</p>';
  const saved = { title: 'About us', bodyHtml };
  for (const colourTreatment of [undefined, 'standard', 'soft']) {
    const html = await renderStudioPreview(richFiles, { page: 'about', previewContent: { pages: { about: [{
      key: 'intro', type: 'hero', content: { ...saved, ...(colourTreatment ? { presentation: { colourTreatment } } : {}) }
    }] } } });
    assert.ok(html.includes(colourRoles(bodyHtml)));
  }
  assert.equal(saved.bodyHtml, bodyHtml);
});
