import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadArtifactDir } from '../src/lib/artifactFiles.mjs';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';

const files = loadArtifactDir(resolve(import.meta.dirname, '../starter'));
const manifest = JSON.parse(files['manifest.json']);
const source = { title: 'Community '.repeat(12), bodyHtml: `<p>${'Neighbours supporting one another. '.repeat(20)}</p>`, imageUrl: 'https://example.invalid/intro.jpg', imageAlt: 'Our community' };

test('Starter optional photo choices have computed effect, exact reset and no-image safety across Looks and directions', async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url() === source.imageUrl
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#9ab89e"/></svg>' }) : route.abort());
  const page = await context.newPage();
  const measure = () => page.locator('.lq-hero').evaluateAll(roots => roots.map(root => {
    const origin = root.getBoundingClientRect();
    const rect = node => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height };
    };
    const style = getComputedStyle(root);
    return { width: origin.width, padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      media: rect(root.querySelector('[data-p60-layout-role="media"]')), content: rect(root.querySelector('[data-p60-layout-role="content"]')),
      title: rect(root.querySelector('h1')), text: root.textContent.replace(/\s+/g, ' ').trim(),
      source: root.querySelector('img')?.getAttribute('src') ?? null, alt: root.querySelector('img')?.getAttribute('alt') ?? null,
      overflow: root.scrollWidth > root.clientWidth + 1 };
  }));
  try {
    for (const width of [390, 768, 1280, 1920]) for (const direction of ['ltr', 'rtl']) for (const look of [{ values: {} }, ...(manifest.looks ?? [])]) {
      await page.setViewportSize({ width, height: 900 });
      const render = async (token, photo = true, hidden = false) => {
        const content = { ...source, ...(hidden ? { title: '' } : {}), ...(!photo ? { imageUrl: '', imageAlt: '' } : {}), ...(token ? { presentation: { sectionLayout: token } } : {}) };
        const html = await renderStudioPreview(files, { surface: 'about', knobs: look.values, previewContent: { pages: { about: [
          { key: 'first', type: 'hero', content }, { key: 'second', type: 'hero', content: source }
        ] } } });
        // The studio blocks external images. Permit only the intercepted synthetic test image.
        await page.setContent(html.replace('<html ', `<html dir="${direction}" `).replace('img-src data:', 'img-src data: https://example.invalid'));
        await page.locator('.lq-hero img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
        return measure();
      };
      const inherited = await render();
      for (const token of ['image-start', 'image-end', 'stacked', undefined]) {
        const [first, second] = await render(token);
        assert.deepEqual(second, inherited[1], 'another introduction keeps its own layout');
        assert.equal(first.overflow, false);
        assert.equal(first.text, inherited[0].text);
        assert.deepEqual(first.padding, inherited[0].padding);
        assert.equal(first.source, source.imageUrl);
        assert.equal(first.alt, source.imageAlt);
        if (width < 1024 || !token || token === 'stacked') {
          assert.ok(first.media.y + first.media.height <= first.content.y + 1, 'narrow and stacked choices keep the photo above copy');
          assert.deepEqual(first, inherited[0], 'default, reset and all narrow choices preserve authored stacking');
        } else {
          const imageFirst = (token === 'image-start') === (direction === 'ltr');
          assert.ok(imageFirst ? first.media.x + first.media.width <= first.content.x + 1 : first.content.x + first.content.width <= first.media.x + 1, `${token}/${direction}: semantic direction is visible`);
          assert.notDeepEqual(first.media, inherited[0].media);
        }
      }
      const noPhoto = await render(undefined, false);
      for (const token of ['image-start', 'image-end', 'stacked']) assert.deepEqual(await render(token, false), noPhoto, 'no-photo choices cannot invent media or columns');
      const hidden = await render('image-start', true, true);
      assert.equal(hidden[0].overflow, false, 'an intentionally blank heading remains safe with imagery');
    }
  } finally { await context.close(); await browser.close(); }
});

test('Starter whole framing uses the complete natural image and Fill deliberately crops only its owned image box', async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce', serviceWorkers: 'block' });
  let imageRequests = 0;
  const shapes = { landscape: [1600, 900], square: [900, 900], portrait: [600, 1200], panorama: [2400, 600] };
  await context.route('**/*', route => {
    const shape = new URL(route.request().url()).searchParams.get('shape');
    if (!shapes[shape]) return route.abort();
    imageRequests++;
    const [width, height] = shapes[shape];
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#8cb699"/></svg>` });
  });
  const page = await context.newPage();
  try {
    for (const width of [390, 1280]) for (const shape of Object.keys(shapes)) for (const sectionLayout of ['stacked', 'image-start']) for (const look of [{ values: {} }, ...(manifest.looks ?? [])]) {
      await page.setViewportSize({ width, height: 900 });
      const imageUrl = `${source.imageUrl}?shape=${shape}`;
      const html = await renderStudioPreview(files, { surface: 'about', knobs: look.values, previewContent: { pages: { about: [
        { key: 'framed', type: 'hero', content: { ...source, imageUrl, presentation: { sectionLayout } } }
      ] } } });
      await page.setContent(html.replace('img-src data:', 'img-src data: https://example.invalid'));
      await page.locator('.lq-hero img').evaluate(image => { image.loading = 'eager'; return image.decode(); });
      const measure = () => page.locator('.lq-hero').evaluate(root => {
        const img = root.querySelector('img'), heading = root.querySelector('h1'), content = root.querySelector('[data-p60-layout-role="content"]');
        const box = img.getBoundingClientRect(), style = getComputedStyle(img), frame = getComputedStyle(root.querySelector('[data-p60-layout-role="frame"]'));
        return { width: box.width, height: box.height, natural: img.naturalWidth / img.naturalHeight, fit: style.objectFit,
          ratio: style.aspectRatio, src: img.getAttribute('src'), alt: img.getAttribute('alt'), columns: frame.gridTemplateColumns,
          contentWidth: content.getBoundingClientRect().width, fontSize: getComputedStyle(heading).fontSize, text: content.textContent,
          overflow: root.scrollWidth > root.clientWidth + 1 };
      });
      const inherited = await measure(), initialRequests = imageRequests;
      assert.ok(Math.abs(inherited.width / inherited.height - inherited.natural) < .01, `${shape}/${width}: default shows the full natural photograph`);
      for (const value of ['fill', 'whole', '']) {
        await page.locator('.lq-hero img').evaluate((image, value) => image.setAttribute('data-p60-photo-framing', value), value);
        const next = await measure();
        for (const key of ['width', 'src', 'alt', 'columns', 'contentWidth', 'fontSize', 'text', 'overflow']) assert.deepEqual(next[key], inherited[key], `framing leaves ${key} unchanged`);
        if (value === 'fill') {
          assert.equal(next.fit, 'cover');
          const parts = next.ratio.split('/').map(Number);
          assert.ok(Math.abs(next.width / next.height - parts[0] / parts[1]) < .01, 'Fill uses its declared crop ratio');
          if (Math.abs(parts[0] / parts[1] - next.natural) > .01) assert.notEqual(next.height, inherited.height, 'mismatched image shape deliberately crops in Fill');
        } else assert.deepEqual(next, inherited, 'Whole and reset return to the complete uncapped natural photo');
        assert.equal(imageRequests, initialRequests, 'framing attributes never refetch the photograph');
      }
    }
  } finally { await context.close(); await browser.close(); }
});

test('framing reset can restore an author-cropped default independently from explicit Whole', async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  await context.route('**/*', route => route.request().url() === source.imageUrl
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200"><rect width="100%" height="100%" fill="#8cb699"/></svg>' }) : route.abort());
  const page = await context.newPage();
  try {
    const authored = { ...files, 'assets/theme.css': files['assets/theme.css'].replace('.lq-hero img[data-p60-field="imageUrl"] { object-fit:contain; }', '.lq-hero img[data-p60-field="imageUrl"] { aspect-ratio:3 / 2; object-fit:cover; }') };
    const html = await renderStudioPreview(authored, { surface: 'about', previewContent: { pages: { about: [{ key: 'intro', type: 'hero', content: source }] } } });
    await page.setContent(html.replace('img-src data:', 'img-src data: https://example.invalid'));
    await page.locator('.lq-hero img').evaluate(image => { image.loading = 'eager'; return image.decode(); });
    const measure = () => page.locator('.lq-hero img').evaluate(image => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, fit: getComputedStyle(image).objectFit, ratio: getComputedStyle(image).aspectRatio }));
    const inherited = await measure();
    assert.equal(inherited.fit, 'cover');
    assert.ok(Math.abs(inherited.width / inherited.height - 1.5) < .01);
    await page.locator('.lq-hero img').evaluate(image => image.setAttribute('data-p60-photo-framing', 'whole'));
    const whole = await measure();
    assert.equal(whole.fit, 'contain');
    assert.ok(Math.abs(whole.width / whole.height - .5) < .01);
    assert.notEqual(whole.height, inherited.height);
    await page.locator('.lq-hero img').evaluate(image => image.setAttribute('data-p60-photo-framing', ''));
    assert.deepEqual(await measure(), inherited, 'reset means the exact authored design, not a guessed whole default');
  } finally { await context.close(); await browser.close(); }
});
