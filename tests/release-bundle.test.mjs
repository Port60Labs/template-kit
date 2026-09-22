import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, mkdirSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildReleaseBundle, digest } from '../src/lib/releaseBundle.mjs';
import { composePage } from '../src/vendor/validator/site-context-v2.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'p60-release-test-'));
  cpSync(new URL('../starter/', import.meta.url), root, { recursive: true });
  return root;
}
test('the scaffold includes preview configuration and creates a deterministic split release', async () => {
  const root = fixture(), bundle = await buildReleaseBundle(root);
  assert.ok(bundle.files['template/manifest.json']);
  assert.ok(bundle.files['preview/manifest.json']);
  assert.ok(bundle.files['release.json']);
  assert.equal(bundle.release.artifactHash, bundle.demo.artifactHash);
  assert.deepEqual((await buildReleaseBundle(root)).release, bundle.release);
  for (const item of bundle.release.files) {
    assert.equal(item.sha256, digest(bundle.files[item.path].bytes));
    assert.equal(item.size, bundle.files[item.path].bytes.length);
  }
  for (const path of Object.keys(bundle.files).filter(path => path.startsWith('template/'))) {
    assert.match(path, /(?:manifest\.json|layout\.liquid|sections\/\w+\.liquid|pages\/\w+\.liquid|assets\/[^/]+\.css)$/);
    assert.doesNotMatch(bundle.files[path].bytes.toString(), /p60preview:|Illustrative designer/);
  }
  const doc = new JSDOM(bundle.files['preview/' + bundle.demo.looks[0].path].bytes.toString());
  assert.equal(doc.window.document.querySelectorAll('script').length, 1);
  assert.equal(doc.window.document.querySelectorAll('a[href], form[action], iframe, input:not(:disabled)').length, 0);
  const csp = doc.window.document.querySelector('[http-equiv="Content-Security-Policy"]').content;
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /script-src 'sha256-/);
  doc.window.close();
});
test('author images are hashed preview media and survive the render, never runtime assets', async () => {
  const root = fixture(), manifest = JSON.parse(readFileSync(join(root,'manifest.json')));
  const content = { pages: { home: composePage(manifest,'home') } };
  const hero = content.pages.home.find(section => section.type === 'homeHero');
  hero.content.images = [{ imageUrl:'p60preview:example.png',alt:'Author image' }];
  mkdirSync(join(root,'preview/media'),{recursive:true});
  writeFileSync(join(root,'preview/media/example.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
  writeFileSync(join(root,'preview/content.json'),JSON.stringify(content));
  writeFileSync(join(root,'preview/config.json'),JSON.stringify({schemaVersion:1,content:'content.json'}));
  const bundle = await buildReleaseBundle(root);
  const media = Object.keys(bundle.files).filter(path => path.startsWith('preview/media/'));
  assert.equal(media.length,1);
  const html = bundle.files['preview/' + bundle.demo.looks[0].path].bytes.toString();
  assert.ok(html.includes('../' + media[0].slice('preview/'.length)));
  assert.equal(Object.keys(bundle.files).some(path => path.startsWith('template/') && path.endsWith('.png')),false);
  hero.content.images[0].imageUrl = 'https://tenant.example.test/private.jpg';
  writeFileSync(join(root,'preview/content.json'),JSON.stringify(content));
  await assert.rejects(buildReleaseBundle(root), /Use p60preview/);
});
test('preview traversal, linked inputs and unknown configuration fail closed', async () => {
  const root = fixture();
  writeFileSync(join(root,'preview/config.json'),JSON.stringify({schemaVersion:1,content:'../../../outside.json'}));
  await assert.rejects(buildReleaseBundle(root), /outside template/);
  symlinkSync(join(root,'manifest.json'), join(root,'preview/linked.json'));
  writeFileSync(join(root,'preview/config.json'),JSON.stringify({schemaVersion:1,content:'linked.json'}));
  await assert.rejects(buildReleaseBundle(root), /Linked preview/);
  writeFileSync(join(root,'preview/config.json'),JSON.stringify({schemaVersion:1,tenant:'demo'}));
  await assert.rejects(buildReleaseBundle(root), /Unsupported preview/);
});
test('the presentation bridge accepts only the parent and rejects arbitrary URL or CSS injection', () => {
  const page = new JSDOM('<html><head></head><body></body></html>', {url:'https://assets.example.test/demo.html',runScripts:'outside-only'});
  page.window.eval(readFileSync(new URL('../src/lib/designer-bridge.js',import.meta.url),'utf8'));
  const send = (data,source=page.window) => page.window.dispatchEvent(new page.window.MessageEvent('message',{source,origin:'https://admin.example.test',data:{type:'p60-designer-settings',...data}}));
  send({vars:{displayFont:'Inter, sans-serif'}},null);
  assert.equal(page.window.document.documentElement.style.cssText,'');
  send({vars:{displayFont:'Inter, sans-serif',evil:'url(https://evil.test)'},fonts:['https://evil.test/css','https://fonts.bunny.net/css2?family=Inter:wght@400&display=swap']});
  assert.equal(page.window.document.documentElement.style.getPropertyValue('--p60s-displayFont'),'Inter, sans-serif');
  assert.equal(page.window.document.documentElement.style.getPropertyValue('--p60s-evil'),'');
  assert.equal(page.window.document.querySelectorAll('link').length,1);
  page.window.close();
});
