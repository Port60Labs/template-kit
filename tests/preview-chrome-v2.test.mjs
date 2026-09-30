import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';
import { buildSiteFixture, validatePreviewContent } from '../src/vendor/validator/site-context-v2.mjs';

const files = {
  'manifest.json': JSON.stringify({
    format: 'port60-liquid@2', name: 'chrome-fixture', label: 'Chrome fixture', version: '1.0.0',
    supports: { layout: true, pages: ['home'], sections: [] }
  }),
  'layout.liquid': `{% assign nav = site.nav %}<header>
    <nav data-test-header>{% for item in nav.header %}<span>{{ item.label }}</span>{% for child in item.children %}<a href="{{ child.href }}">{{ child.label }}</a>{% endfor %}{% endfor %}</nav>
    {% island 'member_menu' %}
    </header><main><ul data-test-events>{% for event in site.content.events.items %}<li>{{ event.name }}</li>{% endfor %}</ul>{% content %}</main><footer><nav data-test-footer>{% for item in nav.footer %}<a href="{{ item.href }}">{{ item.label }}</a>{% endfor %}</nav></footer>`
};

const content = () => ({
  nav: {
    header: [{ kind: 'group', label: 'Community & care', href: null, children: [
      { kind: 'link', label: 'Header source link', href: '/header-source' }
    ] }],
    footer: [{ kind: 'link', label: 'Footer source link', href: '/footer-source' }]
  },
  pages: { home: [] }
});

const navHtml = (html, name) => html.match(new RegExp(`<nav data-test-${name}>([\\s\\S]*?)</nav>`))?.[1];

test('v2 preview preserves independent custom header/footer navigation through the full render', async () => {
  const previewContent = content();
  const original = structuredClone(previewContent);
  assert.deepEqual(validatePreviewContent(previewContent), []);
  for (const surface of ['home', 'events']) {
    const html = await renderStudioPreview(files, { previewContent, surface });
    assert.equal(navHtml(html, 'header'), '<span>Community &amp; care</span><a href="/header-source">Header source link</a>', 'No canonical fixture links leak into the custom header');
    assert.equal(navHtml(html, 'footer'), '<a href="/footer-source">Footer source link</a>', 'No header or canonical fixture links leak into the custom footer');
  }
  assert.deepEqual(previewContent, original, 'A render does not mutate the author fixture');
});

test('v2 preview respects explicitly empty header and footer arrays without fixture fallback', async () => {
  for (const empty of ['header', 'footer']) {
    const previewContent = content();
    previewContent.nav[empty] = [];
    const html = await renderStudioPreview(files, { previewContent, surface: 'home' });
    assert.equal(navHtml(html, empty), '');
    assert.match(navHtml(html, empty === 'header' ? 'footer' : 'header'), /source link/);
  }
});

test('v2 preview replaces collection item arrays completely, including an empty selection', async () => {
  const envelope = buildSiteFixture(null).content.events;
  for (const items of [[{ ...envelope.items[0], name: 'Only the authored event' }], []]) {
    const previewContent = { ...content(), events: { ...envelope, items } };
    assert.deepEqual(validatePreviewContent(previewContent), []);
    const html = await renderStudioPreview(files, { previewContent, surface: 'home' });
    const events = html.match(/<ul data-test-events>([\s\S]*?)<\/ul>/)?.[1];
    assert.equal(events, items.length ? '<li>Only the authored event</li>' : '');
  }
});

test('member preview stays compact and keeps the production responsive label hook', async () => {
  const html = await renderStudioPreview(files, { previewContent: content(), surface: 'home' });
  const member = html.match(/<div data-p60-preview-island="member_menu"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(member, 'The inert member control remains visible in preview');
  assert.match(member, /class="nav-p60-signin"[^>]*disabled/);
  assert.match(member, /aria-label="Sign in with Port60 ID"/);
  assert.match(member, /<svg class="nav-account-icon"/);
  assert.match(member, /<span class="nav-p60-signin-label">Sign in<\/span>/);
  assert.doesNotMatch(member, /p60-preview-badge|member menu preview/i);
  assert.equal((member.match(/<button\b/g) ?? []).length, 1);
});

test('visitor language controls stay absent, including legacy slots and author fixture options', async () => {
  const candidate = { ...files, 'layout.liquid': `<header>
    {% if site.locale.languages.size > 1 %}<div data-test-language-wrapper>{% island 'language_switch' %}</div>{% endif %}
    {% island 'language_switch' %}{% island 'member_menu' %}
    <span data-test-locale="{{ site.locale.code }}" dir="{{ site.locale.direction }}">{{ site.brand.name }}</span>
    </header><main>{% content %}</main>` };
  assert.deepEqual(buildSiteFixture(null).locale.languages, []);
  for (const code of ['en', 'cy', 'ar']) {
    const direction = code === 'ar' ? 'rtl' : 'ltr';
    const previewContent = { ...content(), locale: { code, direction, languages: [
      { code: 'en', label: 'English', direction: 'ltr' }, { code: 'ar', label: 'العربية', direction: 'rtl' }
    ] } };
    const original = structuredClone(previewContent);
    const html = await renderStudioPreview(candidate, { previewContent });
    assert.doesNotMatch(html, /data-test-language-wrapper|data-p60-preview-island="language_switch"|<select[^>]*language-switch/);
    assert.ok(html.includes(`data-test-locale="${code}" dir="${direction}"`));
    assert.match(html, /data-p60-preview-island="member_menu"/);
    assert.deepEqual(previewContent, original, 'Old fixture data is not rewritten');
  }
  const defaultHtml = await renderStudioPreview(candidate);
  assert.doesNotMatch(defaultHtml, /data-test-language-wrapper|data-p60-preview-island="language_switch"/);
});

test('preview resolves explicit navigation modes and leaves unsupported saved preferences untouched', async () => {
  const manifest = JSON.parse(files['manifest.json']);
  manifest.supports.navigationModes = { options: ['simple', 'mega'], default: 'mega' };
  const candidate = { ...files, 'manifest.json': JSON.stringify(manifest),
    'layout.liquid': '<nav data-p60-navigation-mode="{{ site.nav.headerMode }}">{% for item in site.nav.header %}{{ item.label }}{% endfor %}</nav>{% content %}' };
  for (const headerMode of [undefined, 'simple', 'mega']) {
    const previewContent = content();
    if (headerMode !== undefined) previewContent.nav.headerMode = headerMode;
    const original = structuredClone(previewContent);
    const html = await renderStudioPreview(candidate, { previewContent });
    assert.ok(html.includes('data-p60-navigation-mode="' + (headerMode ?? 'mega') + '"'));
    assert.deepEqual(previewContent, original);
  }
  delete manifest.supports.navigationModes;
  candidate['manifest.json'] = JSON.stringify(manifest);
  const previewContent = content(); previewContent.nav.headerMode = 'simple';
  assert.ok((await renderStudioPreview(candidate, { previewContent })).includes('data-p60-navigation-mode=""'));
  assert.equal(previewContent.nav.headerMode, 'simple');
});

test('preview collection hiding shares host projection and keeps heading and records intact', async () => {
  const manifest = JSON.parse(files['manifest.json']);
  manifest.supports.sections = ['events'];
  manifest.supports.sectionCollectionLinkVisibility = ['events'];
  const candidate = { ...files, 'manifest.json': JSON.stringify(manifest),
    'sections/events.liquid': '<h2>{{ section.title }}</h2><a data-p60-collection-link href="{{ site.content.events.href }}"{% if section.showCollectionLink == false %} hidden{% endif %}>{{ site.content.events.label }}</a>' };
  const previewContent = content();
  previewContent.pages.home = [{ key: 'event-section', type: 'events', content: { title: 'Keep this heading', showCollectionLink: false } }];
  const original = structuredClone(previewContent);
  let html = await renderStudioPreview(candidate, { previewContent });
  assert.match(html, /<h2>Keep this heading<\/h2><a data-p60-collection-link href="\/events" hidden>Events<\/a>/);
  delete manifest.supports.sectionCollectionLinkVisibility;
  candidate['manifest.json'] = JSON.stringify(manifest);
  html = await renderStudioPreview(candidate, { previewContent });
  assert.match(html, /<h2>Keep this heading<\/h2><a data-p60-collection-link href="\/events">Events<\/a>/);
  assert.deepEqual(previewContent, original);
});
