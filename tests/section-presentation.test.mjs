import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifact } from '../src/vendor/validator/validate.mjs';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';
import registry from '../src/vendor/contract/v2/presentation.json' with { type: 'json' };
import catalogue from '../src/vendor/contract/v2/sections.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import { readSectionPresentation, withSectionPresentation } from '../src/vendor/engine/section-presentation.mjs';
import { agentsMd } from '../src/lib/agentsMd.mjs';

const manifest = { name: 'heading-scale-kit', label: 'Heading scale kit', version: '1.0.0', format: 'port60-liquid@2',
  supports: { pages: ['about'], sections: ['hero'], islands: [], sectionPresentation: {
    hero: { headingScale: { options: ['compact', 'large'], default: 'compact' } }
  } } };
const files = {
  'manifest.json': JSON.stringify(manifest),
  'sections/hero.liquid': '<h1 data-p60-heading-scale="{{ section.presentation.headingScale }}">{{ section.title }}</h1>',
  'assets/theme.css': '[data-p60-heading-scale="compact"] {font-size:2rem} [data-p60-heading-scale="large"] {font-size:4rem}'
};

test('vendored layouts remain per-section and require independently declared photograph fields', async () => {
  const layout = { options: ['image-start', 'image-end', 'stacked'], default: 'stacked' };
  const caps = { hero: { sectionLayout: layout } };
  assert.deepEqual(registry.controls.sectionLayout.options, layout.options);
  assert.deepEqual(registry.controls.sectionLayout.contentFields, { imageUrl: 'image', imageAlt: 'text' });
  assert.deepEqual(readSectionPresentation(caps, ['hero']), caps);
  assert.equal(readSectionPresentation({ homeHero: caps.hero }, ['homeHero']), null);
  const selected = { ...manifest, supports: { ...manifest.supports, sectionFields: { hero: ['imageUrl', 'imageAlt'] }, sectionPresentation: caps } };
  const content = { title: 'Keep', presentation: { sectionLayout: 'image-start', future: 'kept' } };
  assert.deepEqual(withSectionPresentation(content, 'hero', selected), { title: 'Keep', presentation: { sectionLayout: 'image-start' } });
  assert.deepEqual(withSectionPresentation(content, 'hero', manifest), { title: 'Keep' });
  assert.equal(content.presentation.future, 'kept');
  assert.equal(catalogue.sections.find(section => section.type === 'hero').fields.some(field => field.name === 'imageUrl'), true);
  const invalid = await validateArtifact({ ...files, 'manifest.json': JSON.stringify(selected) });
  assert.ok(invalid.errors.some(error => /actual visible photograph/.test(error)));
  const starter = JSON.parse(readFileSync(new URL('../starter/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(starter.supports.sectionPresentation.hero.sectionLayout, layout);
  assert.deepEqual(starter.supports.sectionFields.hero, ['imageUrl', 'imageAlt', 'photoFraming']);
  assert.match(agentsMd('candidate'), /supports.sectionFields/);
});

test('vendored heading size contract validates and previews exact author choices without default persistence', async () => {
  assert.deepEqual(registry.controls.headingScale.address, ['presentation', 'headingScale']);
  assert.deepEqual((await validateArtifact(files)).errors, []);
  for (const [headingScale, token] of [['large', 'large'], ['standard', ''], [undefined, '']]) {
    const html = await renderStudioPreview(files, { page: 'about', previewContent: { pages: { about: [{
      key: 'hero-1', type: 'hero', content: { title: 'My heading', ...(headingScale ? { presentation: { headingScale } } : {}) }
    }] } } });
    assert.ok(html.includes(`data-p60-heading-scale="${token}"`), headingScale ?? 'inherited');
  }
});

const spacing = { options: ['compact', 'standard', 'spacious'], default: 'standard' };
const spacingCss = '[data-p60-section-spacing="compact"] {padding-block:1rem} [data-p60-section-spacing="standard"] {padding-block:2rem} [data-p60-section-spacing="spacious"] {padding-block:3rem}';
const spacingHook = 'data-p60-section-spacing="{{ section.presentation.sectionSpacing }}"';
const spacingManifest = { ...manifest, supports: { ...manifest.supports, sectionPresentation: { hero: { sectionSpacing: spacing } } } };
const spacingFiles = {
  ...files, 'manifest.json': JSON.stringify(spacingManifest),
  'sections/hero.liquid': `<section ${spacingHook}><p>Body without a heading</p></section>`,
  'assets/theme.css': spacingCss
};

test('vendored spacing-only sections validate without headings and preview explicit/default/reset choices', async () => {
  assert.deepEqual(registry.controls.sectionSpacing.address, ['presentation', 'sectionSpacing']);
  assert.deepEqual((await validateArtifact(spacingFiles)).errors, []);
  for (const [sectionSpacing, token] of [['compact', 'compact'], ['standard', 'standard'], ['spacious', 'spacious'], [undefined, '']]) {
    const html = await renderStudioPreview(spacingFiles, { page: 'about', previewContent: { pages: { about: [{
      key: 'hero-1', type: 'hero', content: { ...(sectionSpacing ? { presentation: { sectionSpacing } } : {}) }
    }] } } });
    assert.ok(html.includes(`data-p60-section-spacing="${token}"`), sectionSpacing ?? 'inherited');
    assert.ok(html.includes('Body without a heading'));
  }
});

test('vendored spacing gate rejects malformed declarations, root/island mistakes and unsafe CSS', async () => {
  for (const sectionSpacing of [{ ...spacing, arbitrary: true }, { options: ['compact'], default: 'compact' },
    { options: ['compact', 'spacious'], default: 'standard' }, { ...spacing, options: ['compact', 'large'] }]) {
    const invalid = { ...spacingManifest, supports: { ...spacingManifest.supports, sectionPresentation: { hero: { sectionSpacing } } } };
    assert.ok((await validateArtifact({ ...spacingFiles, 'manifest.json': JSON.stringify(invalid) })).errors.length);
  }
  for (const source of [`<div><section ${spacingHook}>Inner</section></div>`, `<astro-island ${spacingHook}>Island</astro-island>`,
    `<section data-p60-section-spacing="standard">Default persisted</section>`,
    `<section ${spacingHook}><div ${spacingHook}>Second hook</div></section>`]) {
    assert.ok((await validateArtifact({ ...spacingFiles, 'sections/hero.liquid': source })).errors.some(error => error.includes('sectionSpacing')), source);
  }
  for (const property of ['padding', 'padding-inline', 'gap', 'height', 'font-size']) {
    const css = `${spacingCss} [data-p60-section-spacing="compact"] {${property}:1rem}`;
    assert.ok((await validateArtifact({ ...spacingFiles, 'assets/theme.css': css })).errors.some(error => error.includes('sectionSpacing')), property);
  }
});

test('vendored combined controls remain independent and unsupported choices are omitted from preview', async () => {
  const combined = { ...manifest, supports: { ...manifest.supports, sectionPresentation: {
    hero: { ...manifest.supports.sectionPresentation.hero, sectionSpacing: { options: ['compact', 'spacious'], default: 'compact' } }
  } } };
  const both = { ...files, 'manifest.json': JSON.stringify(combined),
    'sections/hero.liquid': `<section ${spacingHook}>${files['sections/hero.liquid']}</section>`,
    'assets/theme.css': `${files['assets/theme.css']} ${spacingCss}` };
  assert.deepEqual((await validateArtifact(both)).errors, []);
  const mixedContent = { ...both, 'sections/hero.liquid': both['sections/hero.liquid']
    + '{% if section.presentation.headingScale == "large" and section.presentation.sectionSpacing == "spacious" %}<button>Unexpected mixed content</button>{% endif %}' };
  assert.ok((await validateArtifact(mixedContent)).errors.some(error => /combined.*must not change content/.test(error)));
  const content = { title: 'Both', presentation: { headingScale: 'large', sectionSpacing: 'standard' } };
  const before = structuredClone(content);
  const html = await renderStudioPreview(both, { page: 'about', previewContent: { pages: { about: [{ key: 'stable', type: 'hero', content }] } } });
  assert.ok(html.includes('data-p60-heading-scale="large"'));
  assert.ok(html.includes('data-p60-section-spacing=""'));
  assert.deepEqual(content, before);
});
