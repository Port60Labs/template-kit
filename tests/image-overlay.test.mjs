import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifact } from '../src/vendor/validator/validate.mjs';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';
import registry from '../src/vendor/contract/v2/presentation.json' with { type: 'json' };
import { agentsMd } from '../src/lib/agentsMd.mjs';

const manifest = { name: 'overlay-kit', label: 'Overlay kit', version: '1.0.0', format: 'port60-liquid@2',
  supports: { pages: ['home'], sections: ['homeHero'], islands: [], heroImagery: true, heroImageLimit: 1,
    sectionPresentation: { homeHero: { imageOverlay: { options: ['standard', 'strong'], default: 'strong' } } } } };
const files = {
  'manifest.json': JSON.stringify(manifest),
  'sections/homeHero.liquid': '<section data-p60-image-overlay="{{ section.presentation.imageOverlay }}">{% assign photo = section.images.first.imageUrl | default: section.imageUrl %}{% if photo != blank %}<div data-p60-image-overlay-media><img src="{{ photo }}" alt=""><span data-p60-image-overlay-layer></span></div>{% endif %}</section>',
  'assets/theme.css': '[data-p60-image-overlay="standard"] [data-p60-image-overlay-layer] {background:color-mix(in srgb,var(--accent) 8%,transparent)}'
};

test('vendored overlay contract respects subset/default semantics through real validation and preview', async () => {
  assert.equal(registry.controls.imageOverlay.requiresSupport, 'heroImagery');
  assert.deepEqual(registry.controls.imageOverlay.sectionTypes, ['homeHero']);
  assert.deepEqual((await validateArtifact(files)).errors, []);
  for (const [imageOverlay, token] of [['standard', 'standard'], ['strong', 'strong'], ['subtle', ''], [undefined, '']]) {
    const content = { images: [{ imageUrl: 'https://example.test/original.webp', alt: 'Original' }],
      ...(imageOverlay ? { presentation: { imageOverlay } } : {}) };
    const before = structuredClone(content);
    const html = await renderStudioPreview(files, { page: 'home', previewContent: { pages: { home: [{ key: 'hero', type: 'homeHero', content }] } } });
    assert.ok(html.includes(`data-p60-image-overlay="${token}"`));
    assert.deepEqual(content, before);
  }
});

test('vendored overlay proof rejects unsafe CSS and agent briefing describes the ownership boundary', async () => {
  const invalid = { ...files, 'assets/theme.css': files['assets/theme.css'].replace('background:color-mix(in srgb,var(--accent) 8%,transparent)', 'opacity:.2') };
  assert.ok((await validateArtifact(invalid)).errors.some(error => error.includes('palette-derived background')));
  const briefing = agentsMd('overlay-kit');
  assert.ok(briefing.includes('data-p60-image-overlay-media'));
  assert.ok(briefing.includes('Starter deliberately remains'));
});
