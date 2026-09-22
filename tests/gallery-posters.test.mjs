import test from 'node:test';
import assert from 'node:assert/strict';
import { createPosterRenderer, posterResource, galleryCaptureHtml, MAX_POSTER_BYTES } from '../src/lib/galleryPosters.mjs';

const page = html => ({ bytes: Buffer.from(html), contentType: 'text/html; charset=utf-8' });
test('poster asset routing only allows packaged preview assets and the established font host', () => {
  const file = page('<h1>Example</h1>');
  const files = { 'preview/looks/one.html': file };
  assert.equal(posterResource('https://p60-preview.invalid/preview/looks/one.html', files).file, file);
  assert.ok(posterResource('https://fonts.bunny.net/css2?family=Inter:wght@400', files).font);
  for (const url of ['http://127.0.0.1:8083/private', 'file:///etc/passwd',
    'https://p60-preview.invalid/template/manifest.json', 'https://p60-preview.invalid/preview/looks/missing.html',
    'https://fonts.bunny.net:1234/font.woff2', 'https://evil.test/a.woff2',
    'https://user:pass@fonts.bunny.net/css2?family=Inter', 'https://fonts.bunny.net/other']) {
    assert.equal(posterResource(url, files), null, url);
  }
});
test('Arabic capture fallback does not remove the template typography or change the source HTML', () => {
  const html = "<style>@font-face {font-family: 'IBM Plex Sans Arabic';src:url('/fonts/a.woff2')}h1{font-family:var(--p60s-displayFont)}</style><h1>Hello</h1>";
  assert.ok(galleryCaptureHtml(html).includes('h1{font-family:var(--p60s-displayFont)}'));
  assert.ok(!galleryCaptureHtml(html).includes("src:url('/fonts/a.woff2')"));
  assert.ok(html.includes("src:url('/fonts/a.woff2')"));
});
test('the isolated renderer emits bounded WebP at gallery dimensions, refuses missing imagery and remains reusable', async () => {
  const files = {
    'preview/looks/good.html': page('<html><body style="margin:0;background:#056b38;color:white"><h1>A designer preview</h1></body></html>'),
    'preview/looks/bad.html': page('<img src="../media/missing.jpg" width="500" height="300">')
  };
  const renderer = await createPosterRenderer(files);
  try {
    await assert.rejects(renderer.render('looks/bad.html'), /Could not render gallery poster/);
    const bytes = await renderer.render('looks/good.html');
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(bytes.length > 0 && bytes.length <= MAX_POSTER_BYTES);
    // Chromium's lossy WebP has a VP8 frame header. Read the encoded dimensions, not the metadata promise.
    const frame = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    assert.ok(frame > 0);
    assert.equal(bytes.readUInt16LE(frame + 3) & 0x3fff, 960);
    assert.equal(bytes.readUInt16LE(frame + 5) & 0x3fff, 600);
  } finally { await renderer.close(); }
});
