import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { loadArtifactDir } from '../src/lib/artifactFiles.mjs';
import { validateArtifact } from '../src/vendor/validator/validate.mjs';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';
import catalogue from '../src/vendor/contract/v2/sections.json' with { type: 'json' };

const files = loadArtifactDir(resolve(import.meta.dirname, '../starter'));
const manifest = JSON.parse(files['manifest.json']);
const supported = ['homeHero', 'hero', 'values', 'cta'];
const rootSelectors = { homeHero: '.lq-homehero', hero: '.lq-hero', values: '.lq-values', cta: '.lq-cta' };
const stripHooks = html => html.replace(/ data-p60-(?:heading-scale|section-spacing|section-layout|layout-role)="[^"]*"/g, '').replace(/ data-p60-layout-has-media/g, '');
const originalFiles = Object.fromEntries(Object.entries(files).map(([path, source]) => [path,
  path.endsWith('.liquid') ? stripHooks(source)
    : path === 'assets/theme.css' ? source.split('/* Bounded presentation keeps')[0] : source]));
const sample = type => {
  const entry = catalogue.sections.find(section => section.type === type);
  const heading = entry.fields.find(field => field.name === 'title' || field.name === 'heading').name;
  return { ...structuredClone(entry.sample), [heading]: 'Community in action' };
};
const preview = (type, content, source = files) => renderStudioPreview(source, {
  surface: type === 'homeHero' ? 'home' : 'about', focus: 'donate',
  previewContent: { pages: { [type === 'homeHero' ? 'home' : 'about']: [{ key: 'probe', type, content }] } }
});

test('the kit scaffold advertises only its four authored presentation targets and validates cleanly', async () => {
  assert.deepEqual(Object.keys(manifest.supports.sectionPresentation), supported);
  for (const type of supported) assert.deepEqual(manifest.supports.sectionPresentation[type], {
    ...(type === 'hero' ? { sectionLayout: { options: ['image-start', 'image-end', 'stacked'], default: 'stacked' } } : {}),
    headingScale: { options: ['compact', 'standard', 'large'], default: 'standard' },
    sectionSpacing: { options: ['compact', 'standard', 'spacious'], default: 'standard' }
  });
  for (const type of ['people', 'campaigns', 'impactMap']) {
    assert.equal(manifest.supports.sectionPresentation[type], undefined);
    assert.equal(stripHooks(files[`sections/${type}.liquid`]), files[`sections/${type}.liquid`]);
  }
  const result = await validateArtifact(files);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('starter preview retains content, root topology and islands for every combined choice and hidden heading', async () => {
  for (const type of supported) for (const hidden of [false, true]) {
    const content = { ...sample(type), ...(hidden ? { title: '', heading: '' } : {}) };
    const baseline = new JSDOM(await preview(type, content));
    const original = new JSDOM(await preview(type, content, originalFiles));
    try {
      const root = baseline.window.document.querySelector(rootSelectors[type]);
      assert.equal(stripHooks(root.outerHTML), original.window.document.querySelector(rootSelectors[type]).outerHTML);
      for (const headingScale of ['compact', 'standard', 'large']) for (const sectionSpacing of ['compact', 'standard', 'spacious']) {
        const dom = new JSDOM(await preview(type, { ...content, presentation: { headingScale, sectionSpacing } }));
        try {
          const next = dom.window.document.querySelector(rootSelectors[type]);
          assert.equal(next.getAttribute('data-p60-section-spacing'), sectionSpacing);
          assert.equal(next.querySelectorAll('[data-p60-section-spacing]').length, 0);
          for (const heading of next.querySelectorAll('[data-p60-heading-scale]')) assert.equal(heading.getAttribute('data-p60-heading-scale'), headingScale);
          assert.equal(stripHooks(next.outerHTML), stripHooks(root.outerHTML));
        } finally { dom.window.close(); }
      }
    } finally { baseline.window.close(); original.window.close(); }
  }
});

test('starter computed geometry preserves defaults, gutters, gaps and island internals across widths and hero branches', async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  const scenarios = supported.map(type => ({ type, content: sample(type) }));
  for (const actionStyle of ['button', 'widget']) for (const count of [1, 2]) scenarios.push({ type: 'homeHero',
    content: { ...sample('homeHero'), photoFraming: 'whole', actionStyle,
      images: Array.from({ length: count }, () => ({ imageUrl: 'https://invalid.example/photo.jpg', alt: 'Fixture photo' })) } });
  const measure = selector => page.locator(selector).evaluate(root => {
    const css = getComputedStyle(root);
    const heading = root.querySelector('[data-p60-heading-scale],h1,h2');
    const geometry = node => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      // The authored absolute background photograph stretches with its section's padding;
      // it is not a content card or island. All flow content and island heights stay checked.
      const height = node.closest('.lq-hero-slides') ? 'root-sized photo backdrop' : box.height;
      return [box.x, box.width, height, style.paddingLeft, style.paddingRight,
        style.rowGap, style.columnGap, style.fontSize].map(value => typeof value === 'number' ? Math.round(value * 100) / 100 : value);
    };
    return { padding: [parseFloat(css.paddingTop), parseFloat(css.paddingBottom)],
      inline: [css.paddingLeft, css.paddingRight], headingFont: parseFloat(getComputedStyle(heading).fontSize),
      descendants: [...root.querySelectorAll('*')].map(geometry) };
  });
  try {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const { type, content } of scenarios) {
        const selector = rootSelectors[type];
        await page.setContent(await preview(type, content, originalFiles));
        const original = await measure(selector);
        await page.setContent(await preview(type, content));
        const inherited = await measure(selector);
        assert.deepEqual(inherited, original, `${type}/${width}: original authored geometry stays unchanged`);
        for (const sectionSpacing of ['compact', 'standard', 'spacious']) {
          await page.setContent(await preview(type, { ...content, presentation: { sectionSpacing } }));
          const current = await measure(selector);
          assert.deepEqual(current.inline, inherited.inline, `${type}: gutters do not change`);
          assert.deepEqual(current.descendants, inherited.descendants, `${type}: only outer block padding changes`);
          assert.equal(current.headingFont, inherited.headingFont);
          if (sectionSpacing === 'standard') assert.deepEqual(current, inherited);
          else {
            const compare = sectionSpacing === 'compact' ? (a, b) => a <= b : (a, b) => a >= b;
            assert.ok(current.padding.every((value, index) => compare(value, inherited.padding[index])));
            assert.notDeepEqual(current.padding, inherited.padding, `${type}: spacing must visibly change padding`);
          }
        }
        for (const headingScale of ['compact', 'standard', 'large']) {
          await page.setContent(await preview(type, { ...content, presentation: { headingScale, sectionSpacing: 'standard' } }));
          const current = await measure(selector);
          assert.deepEqual(current.padding, inherited.padding);
          assert.deepEqual(current.inline, inherited.inline);
          if (headingScale === 'standard') assert.deepEqual(current, inherited);
          else assert.ok(headingScale === 'compact' ? current.headingFont < inherited.headingFont : current.headingFont > inherited.headingFont);
        }
        await page.setContent(await preview(type, content));
        assert.deepEqual(await measure(selector), inherited, `${type}: reset restores exact inherited geometry`);
      }
    }
  } finally { await context.close(); await browser.close(); }
});
