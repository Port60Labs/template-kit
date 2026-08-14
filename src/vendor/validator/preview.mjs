// The STUDIO PREVIEW renderer (developer program T1.3): a validated artifact rendered over the
// contract's KIND FIXTURES — no tenant, no tenant data, exactly what `template-kit dev` will show
// locally in T3. Deliberately NOT the production TemplateHost path: a studio version must never
// touch a live site, so this renders from an in-memory file map and the page it produces is
// self-contained and network-dead — a CSP meta of default-src 'none' means the template's CSS
// cannot fetch, beacon or import anything, and the consumer embeds it in a sandboxed iframe.
// Islands render as realistic, non-interactive fixture skeletons through their public styling
// classes. Preview HTML carries no runtime and never attempts a platform transaction.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Liquid } from 'liquidjs';
import { CONTENT_SLOT, configureDialect, splitIslandParts } from '../engine/dialect.mjs';
import { LIQUID_BUDGETS } from '../engine/budgets.mjs';
import dialect from '../contract/v1/dialect.json' with { type: 'json' };
import sectionCatalogue from '../contract/v1/sections.json' with { type: 'json' };
import islandRegistry from '../contract/v1/islands.json' with { type: 'json' };
import contextContract from '../contract/v1/context.json' with { type: 'json' };
import { resolveFixtureArt } from './fixture-art.mjs';
import { buildSiteFixture, applyPreviewContent } from './site-context.mjs';

// Fixture imagery resolved for the SEALED studio render (p60fixture: refs become inline-SVG data
// URIs the network-dead CSP can show). The dev preview may instead resolve them to the platform
// CDN via options.fixtureImageBase — the dev-richer / studio-sealed split.
const STUDIO_FX = resolveFixtureArt(contextContract.fixtures);

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The platform base stylesheet — production loads it on EVERY template page before the theme, so
// the preview does too: islands and platform components arrive with their real baseline look,
// wearing the template's tokens, and the theme restyles over it exactly as in production.
// (Generated copy of src/styles/global.css — scripts/build-preview-base.mjs.)
let PLATFORM_BASE = '';
try {
  PLATFORM_BASE = readFileSync(join(import.meta.dirname, 'platform-base.css'), 'utf8');
} catch {
  // An older vendored copy without the file — the preview degrades to theme-only styling.
}

function previewNote(name) {
  return `<span class="p60-preview-badge">${escapeHtml(name.replaceAll('_', ' '))} preview</span>`;
}

function eventCards(events) {
  return events.slice(0, 3).map((event) => `
    <article class="carousel-slide">
      <div class="carousel-caption">
        <p>${escapeHtml(event.venueName ?? (event.online ? 'Online' : 'Event'))}</p>
        <h3>${escapeHtml(event.name)}</h3>
        <a href="${escapeHtml(event.detailHref)}">View event</a>
      </div>
    </article>`).join('');
}

function islandSkeleton(name, ctx = {}, fx = STUDIO_FX) {
  const fixtures = fx;
  const events = fixtures.sections?.events?.events ?? fixtures.pages?.events?.events ?? [];
  const infoEvents = fixtures.sections?.whatsOn?.infoEvents ?? [];
  const articles = fixtures.sections?.articles?.latestArticles ?? [];

  switch (name) {
    case 'donation_widget':
      return `<section class="donate-card" data-p60-preview-island="donation_widget">
        ${previewNote(name)}
        <header class="donate-head"><h3>Make a donation</h3><p class="donate-sub">Your support makes this work possible.</p></header>
        <div class="freq-tabs" aria-label="Donation frequency"><button class="freq-tab" type="button" disabled>One off</button><button class="freq-tab" type="button" disabled>Monthly</button></div>
        <div class="amount-grid"><button class="amount-option" type="button" disabled>£10</button><button class="amount-option" type="button" disabled>£25</button><button class="amount-option" type="button" disabled>£50</button></div>
        <div class="giftaid-box"><strong>Add Gift Aid</strong><p>Eligible UK taxpayers can increase their donation by 25%.</p></div>
        <button class="donate-submit" type="button" disabled>Continue</button>
        <p class="donate-note">Secure payment provided by Port60</p>
      </section>`;
    case 'member_menu':
      // Lives INSIDE the nav row, so the wrapper stays inline and the badge trails the button —
      // block layout here read as a stray element between the nav's last link and Sign in.
      return `<div data-p60-preview-island="member_menu" style="display:inline-flex;align-items:center;gap:8px">
        <button class="nav-p60-signin" type="button" disabled><span class="p60-mark" aria-hidden="true">P</span> Sign in</button>
        ${previewNote(name)}
      </div>`;
    case 'events_carousel': {
      const dots = Math.max(Math.min(events.length, 3), 2);
      return `<section class="events-carousel" data-p60-preview-island="events_carousel">
        ${previewNote(name)}
        ${eventCards(events)}
        <div class="carousel-dots" aria-hidden="true">${Array.from({ length: dots }, () => '<span class="carousel-dot"></span>').join('')}</div>
      </section>`;
    }
    case 'whats_on_strip':
      return `<section class="info-events-bar" data-p60-preview-island="whats_on_strip">
        ${previewNote(name)}
        <div class="info-events-inner">${infoEvents.map((event) => `<a class="info-event-chip" href="${escapeHtml(event.detailHref)}"><strong>${escapeHtml(event.name)}</strong><span>${escapeHtml(event.venueName ?? 'Online')}</span></a>`).join('')}</div>
      </section>`;
    case 'latest_articles':
      return `<section data-p60-preview-island="latest_articles">
        ${previewNote(name)}
        <div class="article-grid">${articles.map((article) => `<article class="article-card"><div class="article-card-body"><p>${escapeHtml(article.categories?.[0] ?? 'Article')}</p><h3><a href="${escapeHtml(article.href)}">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.excerpt ?? '')}</p></div></article>`).join('')}</div>
        <a class="article-strip-cta" href="/articles/all">Read all articles</a>
      </section>`;
    case 'course_enrol':
      return `<section class="course-enrol" data-p60-preview-island="course_enrol">
        ${previewNote(name)}
        <div class="course-variant-list"><strong>Choose a session</strong><label><input type="radio" disabled> Saturday mornings</label><label><input type="radio" disabled> Tuesday evenings</label></div>
        <div class="course-subject-list"><strong>Participant</strong><p>One child place</p></div>
        <div class="course-summary"><span>Weekly course</span><strong>£15</strong></div>
        <div class="course-pay-panel"><button type="button" disabled>Continue to enrolment</button></div>
      </section>`;
    case 'article_engagement':
      return `<aside class="article-engage" data-p60-preview-island="article_engagement">
        ${previewNote(name)}
        <span class="article-views">82 views</span>
        <div class="article-share-group"><span class="article-share-word">Share</span><button class="article-share-btn" type="button" disabled>Email</button><button class="article-share-btn" type="button" disabled>Copy link</button></div>
      </aside>`;
    case 'next_prayer': {
      const time = (fx.layout?.worship?.times ?? [])
        .find((t) => t.name === 'Asr') ?? { name: 'Asr', congregation: '19:00' };
      return `<aside class="next-prayer" data-p60-preview-island="next_prayer">
        ${previewNote(name)}
        <span class="next-prayer-label">Next</span><strong class="next-prayer-name">${escapeHtml(time.name)}</strong><span class="next-prayer-time">${escapeHtml(time.congregation ?? time.begins ?? '')}</span><span class="next-prayer-countdown">1h 24m</span>
      </aside>`;
    }
    case 'article_comments':
      return `<section class="article-comments" data-p60-preview-island="article_comments">
        ${previewNote(name)}
        <div class="article-comment-list"><article class="article-comment"><header class="article-comment-head"><strong>Margaret H.</strong></header><p>Wonderful to see the garden open at last. See you Saturday.</p></article></div>
        <div class="article-comments-gate"><p class="article-comments-note">Sign in to join the conversation.</p></div>
      </section>`;
    case 'hero_carousel': {
      // Hydrated from the surrounding section's images (the homeHero sample fixture) — real
      // slides through the real styling API, CSS-crossfaded by the preview so it reads as alive.
      const images = Array.isArray(ctx.section?.images) ? ctx.section.images.filter((i) => i?.imageUrl) : [];
      const slides = images.length > 0
        ? images.map((image, i) => `<div class="hero-slide${i === 0 ? ' hero-slide--active' : ''} p60-preview-slide"><img class="hero-slide-img" src="${escapeHtml(image.imageUrl)}" alt="${escapeHtml(image.alt ?? '')}"><div class="hero-slide-scrim"></div></div>`).join('')
        : '<div class="hero-slide hero-slide--active"><div class="hero-slide-img p60-preview-hero-image"></div><div class="hero-slide-scrim"></div></div>';
      const dots = Math.max(images.length, 2);
      return `<section class="hero-carousel" data-p60-preview-island="hero_carousel">
        ${previewNote(name)}
        <div class="hero-slides">${slides}</div>
        <div class="hero-dots" aria-hidden="true">${Array.from({ length: dots }, (_, i) => `<span class="hero-dot${i === 0 ? ' hero-dot--active' : ''}"></span>`).join('')}</div>
      </section>`;
    }
    case 'newsletter_signup':
      return `<form class="newsletter-signup" data-p60-preview-island="newsletter_signup">
        ${previewNote(name)}
        <label class="newsletter-label">Email address</label><div class="newsletter-fields"><input class="newsletter-email" type="email" disabled><button class="newsletter-submit" type="button" disabled>Join our newsletter</button></div>
        <label class="newsletter-consent"><input type="checkbox" disabled><span>Email me about our work and appeals.</span></label>
      </form>`;
    case 'language_switch':
      return `<label class="language-switch" data-p60-preview-island="language_switch">${previewNote(name)}<span class="language-switch-label">Language</span><select class="language-switch-select" disabled><option>English</option><option>Cymraeg</option><option>العربية</option></select></label>`;
    case 'search':
      return `<div class="site-search" data-p60-preview-island="search">${previewNote(name)}<form class="site-search-form"><label class="site-search-label">Search this site</label><div class="site-search-fields"><input class="site-search-input" type="search" disabled><button class="site-search-submit" type="button" disabled>Search</button></div></form><ul class="site-search-results"><li class="site-search-result"><span class="site-search-kind">Article</span><a class="site-search-link" href="#">The Community Garden Opens Its Gates</a><p class="site-search-summary">Two years of digging and Saturday mornings in the rain: the Foundry Lane garden is open.</p></li></ul></div>`;
    case 'volunteer_signup': {
      const opportunities = fx.sections?.volunteering?.opportunities ?? [];
      const options = (opportunities.length ? opportunities : [{ title: 'Garden Volunteer' }])
        .map((o) => `<option>${escapeHtml(o.title)}</option>`).join('');
      return `<form class="volunteer-signup" data-p60-preview-island="volunteer_signup">${previewNote(name)}<label class="volunteer-field"><span>Opportunity</span><select disabled>${options}</select></label><label class="volunteer-field"><span>Name</span><input disabled></label><label class="volunteer-field"><span>Email address</span><input disabled></label><label class="volunteer-privacy"><input type="checkbox" disabled><span>I agree that the organisation may respond.</span></label><button class="volunteer-submit" type="button" disabled>Register my interest</button></form>`;
    }
    case 'map': {
      // The impact-map skeleton: the fixture's points projected onto a token-themed canvas —
      // the same fallback rendering production uses until the platform tile layer is configured.
      const im = fx.sections?.impactMap?.impactMap ?? { title: 'Impact map', points: [] };
      const pts = im.points ?? [];
      const lats = pts.map((pt) => pt.latitude);
      const lngs = pts.map((pt) => pt.longitude);
      const pad = 0.15;
      const latMin = Math.min(...lats), latMax = Math.max(...lats);
      const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
      const pos = (pt) => {
        const x = lngMax === lngMin ? 50 : (pad + (1 - 2 * pad) * ((pt.longitude - lngMin) / (lngMax - lngMin))) * 100;
        const y = latMax === latMin ? 50 : (pad + (1 - 2 * pad) * (1 - (pt.latitude - latMin) / (latMax - latMin))) * 100;
        return `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%`;
      };
      const first = pts[0] ?? null;
      return `<section class="impact-map" data-p60-preview-island="map">
        ${previewNote(name)}
        <div class="impact-map-canvas" style="position:relative;min-height:320px;border-radius:12px;background:linear-gradient(160deg,#22303c,#101820)">
          ${pts.map((pt, i) => `<button class="impact-map-pin${i === 0 ? ' impact-map-pin--active' : ''}" type="button" disabled style="position:absolute;${pos(pt)};width:14px;height:14px;border-radius:50%;border:2px solid #fff;background:currentColor" aria-label="${escapeHtml(pt.title)}"></button>`).join('')}
        </div>
        ${first ? `<aside class="impact-map-card"><span class="impact-map-card-kind">${escapeHtml(first.kind)}</span><h3 class="impact-map-card-title">${escapeHtml(first.title)}</h3><p class="impact-map-card-summary">${escapeHtml(first.summary ?? '')}</p>${first.href ? `<a class="impact-map-card-cta" href="${escapeHtml(first.href)}">See more</a>` : ''}</aside>` : '<p class="impact-map-empty">No published map yet.</p>'}
      </section>`;
    }
    case 'form':
      return `<form class="public-form" data-p60-preview-island="form">${previewNote(name)}<header class="public-form-head"><h2>Ask the team</h2><p>Send a question and the team will respond.</p></header><label class="public-form-field"><span>Name</span><input disabled></label><label class="public-form-field"><span>Email address</span><input disabled></label><label class="public-form-field"><span>Your question</span><textarea disabled></textarea></label><label class="public-form-privacy"><input type="checkbox" disabled><span>I agree that the organisation may respond.</span></label><button class="public-form-submit" type="button" disabled>Send</button></form>`;
    default:
      return `<div class="p60-preview-island" data-p60-preview-island="${escapeHtml(name)}" role="note">${previewNote(name)}</div>`;
  }
}

// ── Platform surface skeletons ──────────────────────────────────────────────
// The ROUTED dev preview's answer to "what does X look like in my theme": each platform-owned
// page as a fixture skeleton through the PRODUCTION class names, so the platform base + the
// theme's tokens style it exactly as live, wrapped by the template's own layout. Never
// interactive — the same posture as island skeletons. Where the theme ships its own page
// template for a surface (events, course, articles, article), that template renders instead.

function surfaceDivider(label) {
  return `<div class="p60-preview-divider" role="note">platform page: ${escapeHtml(label)} — styled by your tokens and chrome</div>`;
}

function eventsListingSkeleton(fx = STUDIO_FX) {
  const events = fx.pages?.events?.events ?? [];
  return `${surfaceDivider('events')}<section class="section"><div class="container">
    <h1>What's on</h1>
    <div class="event-grid">${events.map((e) => `
      <article class="event-card">
        <div class="event-card-body">
          <span class="event-card-mode">${escapeHtml(e.registrationMode ?? 'INFO')}</span>
          <h3>${escapeHtml(e.name)}</h3>
          <p class="event-card-when">${escapeHtml(e.venueName ?? (e.online ? 'Online' : ''))}</p>
          <span class="event-action">${e.registrationMode === 'TICKETED' ? 'Get tickets' : 'View event'}</span>
        </div>
      </article>`).join('')}</div>
  </div></section>`;
}

function eventDetailSkeleton(fx = STUDIO_FX) {
  const event = (fx.pages?.events?.events ?? [])
    .find((e) => e.registrationMode === 'TICKETED') ?? { name: 'Fixture Gala', venueName: 'Town Hall' };
  const tier = (name, sub, price, note) => `
    <div class="ticket-type"><div class="tt-main">
      <div class="tt-info"><span class="tt-name">${name}</span><span class="tt-sub">${sub}</span>${note ? `<span class="tt-desc">${note}</span>` : ''}</div>
      <span class="tt-price">${price}</span>
      <div class="tt-qty"><button class="tt-stepper" type="button" disabled>−</button><span>0</span><button class="tt-stepper" type="button" disabled>+</button></div>
    </div></div>`;
  return `${surfaceDivider('event tickets')}<section class="section"><div class="container">
    <article class="event-detail" data-p60-preview-island="event tickets">
      ${previewNote('ticket purchase')}
      <h1>${escapeHtml(event.name)}</h1>
      <p class="event-detail-meta">${escapeHtml(event.venueName ?? 'Online')}</p>
      <p class="event-detail-desc">${escapeHtml(event.description ?? 'An evening of music and giving.')}</p>
      <div class="ticket-types">
        <span class="tt-tier">General admission</span>
        ${tier('Adult', 'General', '£15', '')}
        ${tier('Family', 'General', '£40', 'Admits 2 adults and 2 children')}
      </div>
      <div class="ticket-order-summary"><span>Nothing selected yet</span><strong>£0</strong></div>
      <button class="donate-submit" type="button" disabled>Buy tickets</button>
    </article>
  </div></section>`;
}

function donateSkeleton(fx = STUDIO_FX) {
  const causes = fx.sections?.appealGrid?.causes
    ?? fx.sections?.emergency?.causes ?? [];
  return `${surfaceDivider('donate')}<section class="section"><div class="container">
    <h1>Donate</h1>
    <div class="cause-options">${causes.slice(0, 2).map((c) => `
      <article class="cause-option">
        <div class="cause-option-head"><span class="cause-tag">Appeal</span><h3>${escapeHtml(c.title ?? c.name ?? 'Appeal')}</h3></div>
        <p class="cause-option-desc">${escapeHtml(c.text ?? c.description ?? '')}</p>
        <div class="cause-progress"><div class="cause-progress-track"><div class="cause-progress-fill" style="width: 62%"></div></div><span class="cause-progress-text">62% of target</span></div>
      </article>`).join('')}</div>
    ${islandSkeleton('donation_widget', {}, fx)}
  </div></section>`;
}

function articlesListingSkeleton(fx = STUDIO_FX) {
  const articles = fx.pages?.articles?.articles ?? [];
  return `${surfaceDivider('articles')}<section class="section"><div class="container">
    <h1>Latest</h1>
    <div class="article-grid">${articles.map((a) => `
      <article class="article-card"><div class="article-card-body">
        <p>${escapeHtml(a.categories?.[0] ?? 'Article')}</p>
        <h3><a href="/articles/${escapeHtml(a.slug ?? '')}">${escapeHtml(a.title)}</a></h3>
        <p>${escapeHtml(a.excerpt ?? '')}</p>
      </div></article>`).join('')}</div>
  </div></section>`;
}

function articleDetailSkeleton(fx = STUDIO_FX) {
  const article = fx.pages?.article?.article ?? { title: 'Fixture article', bodyHtml: '<p>Body</p>' };
  return `${surfaceDivider('article')}<section class="section"><div class="container">
    <article class="article-body">
      <h1>${escapeHtml(article.title)}</h1>
      <p class="article-card-meta">${escapeHtml(article.authorName ?? '')} · ${article.readingMinutes ?? 3} min read</p>
      ${article.bodyHtml ?? ''}
      ${islandSkeleton('article_engagement', {}, fx)}
      ${islandSkeleton('article_comments', {}, fx)}
    </article>
  </div></section>`;
}

function campaignsListingSkeleton(fx = STUDIO_FX) {
  const campaigns = fx.sections?.campaigns?.campaigns ?? [];
  return `${surfaceDivider('campaigns')}<section class="section"><div class="container">
    <h1>${escapeHtml(fx.sections?.campaigns?.campaignsLabel ?? 'Campaigns')}</h1>
    <div class="article-grid">${campaigns.map((c) => `
      <article class="article-card"><div class="article-card-body">
        <h3><a href="/campaigns/${escapeHtml(c.href?.split('/').pop() ?? '')}">${escapeHtml(c.title)}</a></h3>
        ${c.summary ? `<p>${escapeHtml(c.summary)}</p>` : ''}
      </div></article>`).join('')}</div>
  </div></section>`;
}

function campaignDetailSkeleton(fx = STUDIO_FX) {
  const campaign = (fx.sections?.campaigns?.campaigns ?? [])[0]
    ?? { title: 'Fixture Winter Campaign', summary: '' };
  return `${surfaceDivider('campaign')}<section class="section"><div class="container">
    <h1>${escapeHtml(campaign.title)}</h1>
    ${campaign.summary ? `<p>${escapeHtml(campaign.summary)}</p>` : ''}
    ${islandSkeleton('form', {}, fx)}
  </div></section>`;
}

function servicesListingSkeleton(fx = STUDIO_FX) {
  const services = fx.sections?.programmes?.services ?? [];
  return `${surfaceDivider('services')}<section class="section"><div class="container">
    <h1>What we do</h1>
    <div class="article-grid">${services.map((s) => `
      <article class="article-card"><div class="article-card-body">
        <h3><a href="${escapeHtml(s.href ?? '#')}">${escapeHtml(s.title)}</a></h3>
        ${s.summary ? `<p>${escapeHtml(s.summary)}</p>` : ''}
      </div></article>`).join('')}</div>
  </div></section>`;
}

function serviceDetailSkeleton(fx = STUDIO_FX) {
  const service = (fx.sections?.programmes?.services ?? [])[0]
    ?? { title: 'Fixture service', summary: '' };
  return `${surfaceDivider('service page')}<section class="section"><div class="container">
    <article class="article-body">
      <h1>${escapeHtml(service.title)}</h1>
      ${service.summary ? `<p>${escapeHtml(service.summary)}</p>` : ''}
      <p>Content pages are written in the workspace's WYSIWYG editor and arrive as sanitised
      HTML — headings, lists, images and embeds render here styled by your theme's typography.</p>
    </article>
  </div></section>`;
}

function courseListingSkeleton(fx = STUDIO_FX) {
  const course = fx.pages?.course?.course ?? { title: 'Fixture course' };
  return `${surfaceDivider('courses')}<section class="section"><div class="container">
    <h1>Courses</h1>
    <article class="event-card"><div class="event-card-body">
      <h3>${escapeHtml(course.title)}</h3>
      <p class="event-card-when">${escapeHtml(course.venue ?? '')}</p>
      <span class="event-action">View course</span>
    </div></article>
  </div></section>`;
}

// surface → { pageTemplate to prefer when the theme declares it, builtin skeleton }
const SURFACES = {
  events: { template: 'events', builtin: eventsListingSkeleton },
  event: { template: null, builtin: eventDetailSkeleton },
  services: { template: null, builtin: servicesListingSkeleton },
  service: { template: null, builtin: serviceDetailSkeleton },
  donate: { template: null, builtin: donateSkeleton },
  articles: { template: 'articles', builtin: articlesListingSkeleton },
  article: { template: 'article', builtin: articleDetailSkeleton },
  campaigns: { template: null, builtin: campaignsListingSkeleton },
  campaign: { template: null, builtin: campaignDetailSkeleton },
  course: { template: 'course', builtin: courseListingSkeleton },
};

/** The routed dev preview's surface names (plus 'home'). */
export const PREVIEW_SURFACES = ['home', ...Object.keys(SURFACES)];

function surfaceBar(active) {
  const link = (name, href) =>
    `<a href="${href}"${name === active ? ' style="font-weight:700;text-decoration:underline"' : ''}>${name}</a>`;
  const links = [
    link('home', '/'), link('events', '/events'), link('event', '/events?event=fixture'),
    link('services', '/services'), link('service', '/services?service=fixture'),
    link('donate', '/donate'), link('articles', '/articles'), link('article', '/articles/fixture'),
    link('campaigns', '/campaigns'), link('campaign', '/campaigns/fixture'), link('course', '/courses'),
    `<a href="/model" style="margin-left:auto;font-weight:700">site.content model →</a>`,
  ];
  return `<nav class="p60-preview-surfaces" aria-label="Preview surfaces" style="position:sticky;top:0;z-index:99;display:flex;gap:12px;flex-wrap:wrap;padding:8px 14px;font:12px/1.4 system-ui,sans-serif;background:#0b1220;color:#e6e9f2;opacity:.94">
    <strong style="letter-spacing:.06em;text-transform:uppercase;font-size:10px">Surfaces</strong>${links.join('')}
  </nav>`;
}

function partsToHtml(html, contentHtml, ctx = {}, fx = STUDIO_FX) {
  let out = '';
  for (const part of splitIslandParts(html)) {
    if (part.island === CONTENT_SLOT) out += contentHtml ?? '';
    else if (part.island) out += islandSkeleton(part.island, ctx, fx);
    else out += part.html;
  }
  return out;
}

/** Knob defaults → the same body attributes / CSS vars TemplateHost stamps, minus network fonts
 *  (the CSP kills font fetches by design; system fallbacks are fine for a structural preview). */
function knobDefaults(manifest) {
  const attrs = [];
  const vars = [];
  for (const knob of manifest?.settings?.schema ?? []) {
    const value = knob.default;
    if (value == null || value === '') continue;
    if (knob.kind === 'color') {
      if (/^#[0-9a-fA-F]{3,8}$/.test(String(value))) vars.push(`--p60s-${knob.key}: ${value};`);
    } else if (knob.kind === 'font') {
      vars.push(`--p60s-${knob.key}: '${String(value).replace(/'/g, '')}', system-ui, sans-serif;`);
    } else {
      attrs.push(`data-p60s-${knob.key}="${escapeHtml(String(value))}"`);
    }
  }
  return { attrs: attrs.join(' '), vars: vars.join(' ') };
}

/**
 * Renders the artifact's declared sections (sample fixtures) inside its layout (when declared)
 * and returns a complete, self-contained HTML document. Throws on parse/render failure — callers
 * preview only versions the validator has already passed, so a throw here is a bug report, not
 * a user flow.
 */
export async function renderStudioPreview(files, options = {}) {
  const manifest = JSON.parse(files['manifest.json']);
  const allIslands = new Set(islandRegistry.islands.map((i) => i.name));
  const liquid = new Liquid({ outputEscape: 'escape', strictFilters: true, ...LIQUID_BUDGETS });
  configureDialect(liquid, dialect, allIslands);

  const catalogueByType = new Map(sectionCatalogue.sections.map((s) => [s.type, s]));
  // Studio-sealed by default; the kit's dev server may pass fixtureImageBase to resolve fixture
  // imagery to the platform CDN instead of inline-SVG art (the dev-richer half of the split).
  const artOptions = options.fixtureImageBase ? { imageBase: options.fixtureImageBase } : null;
  let fx = artOptions ? resolveFixtureArt(contextContract.fixtures, artOptions) : STUDIO_FX;
  // The one content tree (content model v1): about composed from this manifest's declared
  // sections, dev preview-content overlaid when the kit passes it (validated there), imagery
  // resolved exactly like the rest of the fixtures.
  const site = resolveFixtureArt(
    applyPreviewContent(buildSiteFixture(manifest), options.previewContent ?? null),
    artOptions ?? {});
  const brand = site.brand ?? fx.brand;
  // With a content override, the TREE is the source of truth for every fixture view: the routed
  // platform skeletons and island skeletons re-derive their slices from the overridden site, so
  // the developer's own data shows on /events, /donate and friends, not just where site.* is read.
  if (options.previewContent) {
    const c = site.content;
    fx = {
      ...fx,
      brand: site.brand,
      pages: {
        ...fx.pages,
        events: { events: c.events },
        articles: { ...fx.pages?.articles, articles: c.articles },
        article: c.articles?.length
          ? { ...fx.pages?.article, article: { ...fx.pages?.article?.article, ...c.articles[0] } }
          : fx.pages?.article
      },
      sections: {
        ...fx.sections,
        events: { events: (c.events ?? []).filter((e) => e.registrationMode === 'TICKETED') },
        whatsOn: { infoEvents: (c.events ?? []).filter((e) => e.registrationMode === 'INFO') },
        articles: { latestArticles: c.articles ?? [] },
        campaigns: { ...fx.sections?.campaigns, campaigns: c.campaigns ?? [] },
        appealGrid: { causes: c.causes ?? [] },
        emergency: { causes: c.causes ?? [] },
        programmes: { services: c.services ?? [] },
        resources: { resources: c.resources ?? [] },
        locations: { locations: c.locations ?? [] },
        volunteering: { opportunities: c.volunteering ?? [] },
        media: { media: c.media ?? [] }
      }
    };
  }

  const surface = options.surface ?? 'home';
  let contentHtml;
  if (surface !== 'home' && SURFACES[surface]) {
    // A routed platform surface: the theme's own page template when it ships one, else the
    // platform-page fixture skeleton — either way inside the theme's layout below.
    const def = SURFACES[surface];
    const templateSource = def.template ? files[`pages/${def.template}.liquid`] : null;
    const fixture = def.template ? fx.pages?.[def.template] : null;
    if (templateSource != null && fixture != null
        && (manifest?.supports?.pageTemplates ?? []).includes(def.template)) {
      const context = { brand, site, ...fixture };
      const rendered = await liquid.parseAndRender(templateSource, context);
      contentHtml = `<div class="p60-preview-divider" role="note">page template: ${escapeHtml(def.template)}</div>`
        + partsToHtml(rendered, '', context, fx);
    } else {
      contentHtml = def.builtin(fx);
    }
  } else {
    const sectionsHtml = [];
    for (const type of manifest?.supports?.sections ?? []) {
      const entry = catalogueByType.get(type);
      const source = files[`sections/${type}.liquid`];
      if (!entry || source == null) continue;
      const context = {
        section: artOptions ? resolveFixtureArt(entry.sample ?? {}, artOptions) : resolveFixtureArt(entry.sample ?? {}),
        brand,
        site,
        ...(fx.sections?.[type] ?? {})
      };
      const rendered = await liquid.parseAndRender(source, context);
      // Island skeletons see the SAME context the section rendered with — that is what lets the
      // hero carousel skeleton hydrate from the section's own photo fixtures.
      sectionsHtml.push(partsToHtml(rendered, '', context, fx));
    }

    // Declared page templates render too (over their page fixtures) — the loop an author lives in
    // covers every surface they ship, not just home sections. The routed dev preview ALSO serves
    // each at its own path; this keeps the studio's single document complete.
    for (const page of manifest?.supports?.pageTemplates ?? []) {
      const source = files[`pages/${page}.liquid`];
      const fixture = fx.pages?.[page];
      if (source == null || fixture == null) continue;
      const context = { brand, site, ...fixture };
      const rendered = await liquid.parseAndRender(source, context);
      sectionsHtml.push(`<div class="p60-preview-divider" role="note">page template: ${escapeHtml(page)}</div>`
        + partsToHtml(rendered, '', context, fx));
    }
    contentHtml = sectionsHtml.join('\n');
  }

  let bodyHtml;
  if (manifest?.supports?.layout && files['layout.liquid'] != null) {
    const rendered = await liquid.parseAndRender(files['layout.liquid'], {
      brand,
      site,
      nav: fx.layout.nav,
      socials: fx.layout.socials ?? [],
      worship: manifest?.supports?.worship ? (fx.layout.worship ?? null) : null,
      locale: fx.layout.locale
    });
    bodyHtml = partsToHtml(rendered, contentHtml, {}, fx);
  } else {
    bodyHtml = contentHtml;
  }

  const themeCss = files['assets/theme.css'] ?? '';
  const { attrs, vars } = knobDefaults(manifest);

  // The kit's dev server passes the platform's own behaviour runtime (a self-contained bundle) so
  // authors see their carousels, reveals and tabs living locally. The document stays network-dead
  // — the ONLY script it can run is the inline platform bundle; studio and demo previews pass
  // nothing and keep the fully script-free CSP. Without the runtime, a CSS-only crossfade
  // approximates behaviour carousels so a static preview still reads as alive.
  const runtime = options.behaviorsRuntime ?? null;
  // With a fixture image base, the dev document may load imagery from that ONE origin; the studio
  // render never widens beyond data: URIs.
  const imgOrigins = new Set();
  if (options.fixtureImageBase) {
    try {
      imgOrigins.add(new URL(options.fixtureImageBase).origin);
    } catch {
      // A relative or malformed base stays sealed rather than guessing an origin.
    }
  }
  // The author's own imagery (a --content override) renders from exactly the hosts it names.
  for (const origin of options.contentImageOrigins ?? []) {
    imgOrigins.add(origin);
  }
  const imgSrc = ['data:', ...imgOrigins].join(' ');
  const csp = runtime
    ? `default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; script-src 'unsafe-inline';`
    : `default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc};`;
  const motionApproximation = runtime ? '' : `
@media (prefers-reduced-motion: no-preference) {
  [data-p60-carousel] > [data-p60-slide], .p60-preview-slide { animation: p60-preview-crossfade 8s infinite; }
  [data-p60-carousel] > [data-p60-slide]:nth-child(2), .p60-preview-slide:nth-child(2) { animation-delay: -4s; }
  @keyframes p60-preview-crossfade { 0%, 45% { opacity: 1; } 55%, 95% { opacity: 0.25; } 100% { opacity: 1; } }
}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- Network-dead by design: the template's CSS can style, never fetch. -->
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(manifest?.label ?? manifest?.name ?? 'Template preview')} — studio preview</title>
<style>${vars ? `:root { ${vars} }` : ''}
.p60-preview-badge { display: inline-flex; align-items: center; width: fit-content; margin: 0 0 8px;
  border: 1px solid currentColor; border-radius: 999px; padding: 3px 8px; font: 600 10px/1.2 system-ui, sans-serif;
  letter-spacing: .06em; opacity: .62; text-transform: uppercase; }
.p60-preview-island { border: 1px solid currentColor; border-radius: 8px; padding: 18px; margin: 8px 0;
  font: 13px/1.4 system-ui, sans-serif; opacity: .8; text-align: center; }
.p60-preview-hero-image { min-height: 360px; background: linear-gradient(135deg, #596f65, #bdab7c); }
.p60-preview-divider { margin: 32px 0 8px; padding: 6px 10px; border: 1px dashed currentColor; border-radius: 6px;
  font: 600 11px/1.2 system-ui, sans-serif; letter-spacing: .06em; opacity: .62; text-transform: uppercase; }
[data-p60-preview-island] button:disabled, [data-p60-preview-island] input:disabled { opacity: 1; }${motionApproximation}
</style>
<style>${PLATFORM_BASE}</style>
<style>${themeCss}</style>
</head>
<body ${attrs}>
${options.surface ? surfaceBar(surface) : ''}
${bodyHtml}
${runtime ? `<script>${runtime}\np60Behaviors.initBehaviors();</script>` : ''}
</body>
</html>`;
}
