import { Liquid } from 'liquidjs';
import Ajv2020 from 'ajv/dist/2020.js';
import { CONTENT_SLOT, configureDialect, splitIslandParts } from '../engine/dialect.mjs';
import { LIQUID_BUDGETS } from '../engine/budgets.mjs';

import dialect from '../contract/v1/dialect.json' with { type: 'json' };
import sectionCatalogue from '../contract/v1/sections.json' with { type: 'json' };
import islandRegistry from '../contract/v1/islands.json' with { type: 'json' };
import manifestSchema from '../contract/v1/manifest.schema.json' with { type: 'json' };
import contextContract from '../contract/v1/context.json' with { type: 'json' };
import fontCatalogue from '../contract/v1/fonts.json' with { type: 'json' };
import layoutContract from '../contract/v1/layout.json' with { type: 'json' };
import behaviourCatalogue from '../contract/v1/behaviours.json' with { type: 'json' };
import { buildSiteFixture, extractContentFootprint, contentModel } from './site-context.mjs';
import { proveNavigationHighlights } from './navigation-highlights.mjs';

const Ajv = Ajv2020.default ?? Ajv2020;

export { dialect as contractDialect, sectionCatalogue, islandRegistry, contextContract, behaviourCatalogue };

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const BEHAVIOUR_PRIMARY_ATTR = Object.fromEntries(
  behaviourCatalogue.behaviours.map((b) => [b.name, b.primaryAttribute])
);
const PRIMARY_ATTR = Object.fromEntries(
  behaviourCatalogue.behaviours.map((b) => [b.name, [new RegExp(`${escapeRegExp(b.primaryAttribute)}\\b`), b.primaryAttribute]])
);

const FORBIDDEN_MARKUP = [
  [/<script\b/i, 'a <script> tag'],
  [/<(iframe|object|embed)\b/i, 'an embedded frame or plugin element'],
  [/\son(?:click|dbl|aux|load|error|abort|unload|mouse|pointer|touch|drag|drop|wheel|scroll|key|focus|blur|input|change|submit|reset|invalid|select|toggle|copy|paste|cut|context|play|pause|ended|seek|stall|suspend|time|volume|waiting|canplay|animation|transition|message|resize|hashchange|popstate|storage|got|lost)[a-z]*\s*=/i,
    'an inline event handler'],
  [/javascript\s*:/i, 'a javascript: URL'],
];

export async function validateArtifact(files) {
  const errors = [];
  const warnings = [];
  const has = (path) => Object.hasOwn(files, path);
  const read = (path) => files[path];

  let manifest = null;
  if (!has('manifest.json')) {
    return { errors: ['manifest.json is missing, every artifact starts with its manifest'], warnings, manifest };
  }
  try {
    manifest = JSON.parse(read('manifest.json'));
  } catch (e) {
    return { errors: [`manifest.json unreadable: ${e.message}`], warnings, manifest: null };
  }
  if (has('preview-content.json')) {
    errors.push('preview-content.json: development preview data never ships in an artifact, remove it (package excludes it automatically)');
  }

  const contentAnalysis = extractContentFootprint(files);
  errors.push(...contentAnalysis.errors);
  const siteFx = buildSiteFixture(manifest);

  const ajv = new Ajv({ allErrors: true });
  const validateManifest = ajv.compile(manifestSchema);
  if (!validateManifest(manifest)) {
    for (const err of validateManifest.errors) {
      errors.push(`manifest${err.instancePath || ''}: ${err.message}`);
    }
  }

  {
    const sections = new Set(manifest?.supports?.sections ?? []);
    const islands = new Set(manifest?.supports?.islands ?? []);
    const pages = new Set(manifest?.supports?.pageTemplates ?? []);
    const hasAny = (values, expected) => expected.some((value) => values.has(value));
    const capabilitySurface = {
      giving: () => islands.has('donation_widget'),
      appeals: () => hasAny(sections, ['appealGrid', 'emergency']) || islands.has('donation_widget'),
      worship: () => manifest?.supports?.worship === true || islands.has('next_prayer'),
      courses: () => pages.has('course') || islands.has('course_enrol'),
      membership: () => islands.has('member_menu'),
      events: () => sections.has('events') || pages.has('events') || islands.has('events_carousel'),
      articles: () => sections.has('articles') || hasAny(pages, ['articles', 'article']) || islands.has('latest_articles'),
      services: () => sections.has('programmes'),
      forms: () => islands.has('form'),
      resources: () => sections.has('resources'),
      locations: () => sections.has('locations'),
      newsletter: () => islands.has('newsletter_signup'),
      i18n: () => islands.has('language_switch'),
      search: () => islands.has('search'),
      volunteering: () => islands.has('volunteer_signup') || islands.has('primary_action_widget')
    };
    for (const capability of manifest?.requiresCapabilities ?? []) {
      if (!capabilitySurface[capability]?.()) {
        errors.push(`manifest: requiresCapabilities '${capability}' has no corresponding declared section, page template or island`);
      }
    }
  }

  {
    const focusKinds = new Set(manifest?.supports?.focus ?? []);
    if (focusKinds.has('volunteer')) {
      const liquidSource = Object.entries(files).filter(([path]) => path.endsWith('.liquid')).map(([, s]) => s).join('\n');
      if (!/island\s+['"]primary_action_widget['"]/.test(liquidSource) && !/island\s+['"]volunteer_signup['"]/.test(liquidSource)) {
        errors.push("manifest: supports.focus lists 'volunteer' but no section places {% island 'primary_action_widget' %} (or 'volunteer_signup'), so the site could never lead with volunteering");
      }
    }
  }

  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith('.liquid')) continue;
    for (const [pattern, what] of FORBIDDEN_MARKUP) {
      if (pattern.test(source)) {
        errors.push(`${path}: contains ${what}, templates are markup and attributes, never code (behaviour is engine-owned; see the behaviour catalogue)`);
      }
    }
  }

  {
    const declaredBehaviours = new Set(manifest?.supports?.behaviors ?? []);
    const liquidSource = Object.entries(files)
      .filter(([path]) => path.endsWith('.liquid'))
      .map(([, source]) => source)
      .join('\n');
    for (const name of declaredBehaviours) {
      const primary = PRIMARY_ATTR[name];
      if (primary && !primary[0].test(liquidSource)) {
        errors.push(`manifest: supports.behaviors declares '${name}' but no ${primary[1]} attribute appears in any liquid source`);
      }
    }
    for (const [name, [pattern, attr]] of Object.entries(PRIMARY_ATTR)) {
      if (pattern.test(liquidSource) && !declaredBehaviours.has(name)) {
        errors.push(`behaviour '${name}': ${attr} appears in the markup but supports.behaviors does not declare it`);
      }
    }
    if (/data-p60-carousel(?!-)\b/.test(liquidSource) && !/data-p60-slide\b/.test(liquidSource)) {
      errors.push("behaviour 'carousel': a data-p60-carousel container needs data-p60-slide children");
    }
    if (/data-p60-lightbox(?!-)\b/.test(liquidSource) && !/data-p60-lightbox-item\b/.test(liquidSource)) {
      errors.push("behaviour 'lightbox': a data-p60-lightbox group needs data-p60-lightbox-item anchors");
    }
    if (/data-p60-tabs\b/.test(liquidSource)
        && (!/data-p60-tab(?!s)\b/.test(liquidSource) || !/data-p60-panel\b/.test(liquidSource))) {
      errors.push("behaviour 'tabs': a data-p60-tabs container needs data-p60-tab controls and data-p60-panel panels");
    }
    if (/data-p60-nav-item\b/.test(liquidSource)
        && (!/data-p60-nav-toggle\b/.test(liquidSource) || !/data-p60-nav-menu\b/.test(liquidSource))) {
      errors.push("behaviour 'nav': a data-p60-nav-item group needs a data-p60-nav-toggle control and a data-p60-nav-menu panel");
    }
    if (/data-p60-nav-(item|burger)\b/.test(liquidSource) && !/data-p60-nav(?!-)\b/.test(liquidSource)) {
      errors.push("behaviour 'nav': data-p60-nav-item and data-p60-nav-burger need a data-p60-nav root around the menu");
    }
    if (/data-p60-show-more(?!-)\b/.test(liquidSource)
        && (!/data-p60-show-more-item\b/.test(liquidSource) || !/data-p60-show-more-toggle\b/.test(liquidSource))) {
      errors.push("behaviour 'showMore': a data-p60-show-more list needs data-p60-show-more-item entries and a data-p60-show-more-toggle button");
    }
    if (/data-p60-show-more-toggle\b/.test(liquidSource) && !/<button\b[^>]*data-p60-show-more-toggle\b/.test(liquidSource)) {
      errors.push("behaviour 'showMore': data-p60-show-more-toggle belongs on a <button> (a link would navigate; a div would not be operable)");
    }
    if (/data-p60-scrollspy\b/.test(liquidSource) && !/href=["']#[^"'\s]/.test(liquidSource)) {
      errors.push("behaviour 'scrollspy': a data-p60-scrollspy menu needs links to in-page anchors (href=\"#section-id\")");
    }
  }

  {
    const familyNames = new Set(fontCatalogue.families.map((f) => f.name));
    for (const knob of manifest?.settings?.schema ?? []) {
      if (knob.kind !== 'font') continue;
      if (typeof knob.default !== 'string' || !familyNames.has(knob.default)) {
        errors.push(`settings knob '${knob.key}': font default '${knob.default}' is not in the font catalogue`);
      } else if (!Array.isArray(knob.weights) || knob.weights.length === 0) {
        errors.push(`settings knob '${knob.key}': font knobs must declare the weights the template uses`);
      }
    }
  }

  {
    const knobByKey = new Map((manifest?.settings?.schema ?? []).map((k) => [k.key, k]));
    const familyNames = new Set(fontCatalogue.families.map((f) => f.name));
    const seenNames = new Set();
    for (const look of manifest?.looks ?? []) {
      if (seenNames.has(look.name)) errors.push(`look '${look.name}': duplicate name`);
      seenNames.add(look.name);
      for (const [key, value] of Object.entries(look.values ?? {})) {
        const knob = knobByKey.get(key);
        if (!knob) {
          errors.push(`look '${look.name}': '${key}' is not a declared settings knob`);
        } else if (knob.kind === 'select' && !(knob.options ?? []).includes(value)) {
          errors.push(`look '${look.name}': '${value}' is not an option of select knob '${key}'`);
        } else if (knob.kind === 'font' && !familyNames.has(value)) {
          errors.push(`look '${look.name}': font '${value}' is not in the font catalogue`);
        } else if (knob.kind === 'color' && value !== '' && !/^#[0-9a-fA-F]{3,8}$/.test(value)) {
          errors.push(`look '${look.name}': '${value}' is not a colour value for knob '${key}'`);
        }
      }
    }
  }

  const availableIslands = new Set(
    islandRegistry.islands.filter((i) => i.status === 'available').map((i) => i.name)
  );
  const allIslands = new Set(islandRegistry.islands.map((i) => i.name));
  const liquid = new Liquid({ outputEscape: 'escape', strictFilters: true, ...LIQUID_BUDGETS });
  configureDialect(liquid, dialect, allIslands);

  const catalogueByType = new Map(sectionCatalogue.sections.map((s) => [s.type, s]));
  const declaredIslands = new Set(manifest?.supports?.islands ?? []);
  const placedIslands = new Set();
  let homeHeroMultiShows = null;
  let homeHeroSingleShows = null;

  const sentinelOf = (type, dataKey, field) =>
    (contextContract.fixtures.sections?.[type]?.[dataKey] ?? [])[0]?.[field] ?? null;
  const WIDGET_SECTIONS = {
    events: { island: 'events_carousel', dataKey: 'events', sentinel: sentinelOf('events', 'events', 'name') },
    whatsOn: { island: 'whats_on_strip', dataKey: 'infoEvents', sentinel: sentinelOf('whatsOn', 'infoEvents', 'name') },
    articles: { island: 'latest_articles', dataKey: 'latestArticles', sentinel: sentinelOf('articles', 'latestArticles', 'title') },
    campaigns: { island: null, dataKey: 'campaigns', sentinel: sentinelOf('campaigns', 'campaigns', 'title') },
    resources: { island: null, dataKey: 'resources', sentinel: sentinelOf('resources', 'resources', 'title') },
    locations: { island: null, dataKey: 'locations', sentinel: sentinelOf('locations', 'locations', 'name') }
  };

  const compositions = manifest?.compositions ?? {};
  for (const [page, entries] of Object.entries(compositions)) {
    if (!(manifest?.supports?.pages ?? []).includes(page)) {
      errors.push(`compositions.${page}: not in supports.pages`);
      continue;
    }
    const seen = new Set();
    for (const entry of entries ?? []) {
      const type = entry?.type;
      if (!(manifest?.supports?.sections ?? []).includes(type)) {
        errors.push(`compositions.${page}: '${type}' is not in supports.sections`);
        continue;
      }
      const catalogueEntry = catalogueByType.get(type);
      if (catalogueEntry && !(catalogueEntry.pages ?? []).includes(page)) {
        errors.push(`compositions.${page}: '${type}' is not a ${page} page section in the catalogue`);
      }
      if (seen.has(type)) errors.push(`compositions.${page}: '${type}' is listed twice`);
      seen.add(type);
    }
  }

  for (const type of manifest?.supports?.sections ?? []) {
    const entry = catalogueByType.get(type);
    if (!entry) {
      errors.push(`section '${type}': not in the platform section catalogue`);
      continue;
    }
    const file = `sections/${type}.liquid`;
    if (!has(file)) {
      errors.push(`section '${type}': declared in the manifest but sections/${type}.liquid is missing`);
      continue;
    }
    let parsed;
    try {
      parsed = liquid.parse(read(file));
    } catch (e) {
      errors.push(`section '${type}': does not parse under the dialect, ${e.message}`);
      continue;
    }
    const widget = WIDGET_SECTIONS[type];
    if (widget) {
      const dataFixture = contextContract.fixtures.sections?.[type] ?? {};
      try {
        const populated = await liquid.render(parsed, {
          section: {},
          brand: contextContract.fixtures.brand,
          site: siteFx,
          ...dataFixture
        });
        const placesIsland = widget.island !== null
          && splitIslandParts(populated).some((p) => p.island === widget.island);
        if (!placesIsland) {
          if (widget.sentinel && !populated.includes(widget.sentinel)) {
            errors.push(
              widget.island
                ? `section '${type}': neither places the ${widget.island} island nor renders the ${widget.dataKey} context, render the data (the fixture's "${widget.sentinel}" must appear) or place the island`
                : `section '${type}': does not render the ${widget.dataKey} context, the fixture's "${widget.sentinel}" must appear`
            );
          }
          const empty = await liquid.render(parsed, {
            section: {},
            brand: contextContract.fixtures.brand,
            site: { ...siteFx, content: Object.fromEntries(Object.keys(siteFx.content).map((k) => [k, []])) },
            [widget.dataKey]: []
          });
          if (widget.sentinel && empty.includes(widget.sentinel)) {
            errors.push(`section '${type}': still shows fixture content with an empty ${widget.dataKey}, content must come from the context`);
          }
          if (/\bundefined\b|\bnull\b/.test(empty.replace(/data-[a-z-]+="[^"]*"/g, ''))) {
            errors.push(`section '${type}': renders 'undefined'/'null' literals when ${widget.dataKey} is empty, guard the empty case (derive or omit)`);
          }
        }
      } catch (e) {
        errors.push(`section '${type}': failed rendering the ${widget.dataKey} context fixtures, ${e.message}`);
      }
    }
    for (const fixtureName of ['minimal', 'sample']) {
      const fixture = entry[fixtureName] ?? {};
      try {
        const html = await liquid.render(parsed, {
          section: fixture,
          brand: contextContract.fixtures.brand,
          site: siteFx,
          ...(widget ? (contextContract.fixtures.sections?.[type] ?? {}) : {})
        });
        if (type === 'homeHero' && fixtureName === 'sample') {
          const probe = (fixture.images ?? [])[0]?.imageUrl ?? 'p60fixture:';
          homeHeroMultiShows = html.includes(probe)
            || splitIslandParts(html).some((p) => p.island === 'hero_carousel');
          try {
            const single = await liquid.render(parsed, {
              section: { ...fixture, images: (fixture.images ?? []).slice(0, 1) },
              brand: contextContract.fixtures.brand,
              site: siteFx
            });
            homeHeroSingleShows = single.includes(probe);
          } catch {
            homeHeroSingleShows = false;
          }
        }
        for (const part of splitIslandParts(html)) {
          if (part.island === CONTENT_SLOT) {
            errors.push(`section '${type}': uses {% content %}, that tag is layout-only`);
          } else if (part.island) {
            placedIslands.add(part.island);
          }
        }
      } catch (e) {
        errors.push(`section '${type}': failed rendering the ${fixtureName} fixture, ${e.message}`);
      }
    }
  }

  {
    const MARKER = /data-p60-field="([^"]*)"/g;
    const fieldsOf = (type) => new Map((catalogueByType.get(type)?.fields ?? []).map((f) => [f.name, f]));
    const marked = [];
    for (const type of manifest?.supports?.sections ?? []) {
      const source = has(`sections/${type}.liquid`) ? read(`sections/${type}.liquid`) : '';
      const fields = fieldsOf(type);
      for (const [, raw] of source.matchAll(MARKER)) {
        marked.push(type);
        const steps = raw.replace(/\{\{[^}]*\}\}/g, '#').split('.');
        const field = fields.get(steps[0]);
        const named = steps.length === 1
          ? Boolean(field) && field.kind !== 'items'
          : steps.length === 3
            && Boolean(field) && field.kind === 'items'
            && (steps[1] === '#' || /^\d+$/.test(steps[1]))
            && (field.itemFields ?? []).some((f) => f.name === steps[2]);
        if (!named) {
          warnings.push(`section '${type}': data-p60-field="${raw}" does not name a field of this section, the editor will ignore it (a field of ${type}, or items.<index>.<field> for a list)`);
        }
      }
    }
    for (const [path, source] of Object.entries(files)) {
      if (path.endsWith('.liquid') && !path.startsWith('sections/') && MARKER.test(source)) {
        warnings.push(`${path}: data-p60-field marks a section's own content, and there is none here; the editor ignores markers outside sections/`);
      }
      MARKER.lastIndex = 0;
    }
    if (manifest?.supports?.fieldMarkers && marked.length === 0) {
      errors.push('manifest: supports.fieldMarkers is declared but no section marks a field, the editor would offer typing on the page and find nothing to type into');
    }
    if (!manifest?.supports?.fieldMarkers && marked.length > 0) {
      warnings.push('manifest: sections carry data-p60-field markers but supports.fieldMarkers is not declared, declare it so the editor offers typing on the page');
    }
  }

  {
    const declaresHero = manifest?.supports?.heroImagery === true;
    if (declaresHero && !(manifest?.supports?.sections ?? []).includes('homeHero')) {
      errors.push('manifest: supports.heroImagery requires the homeHero section, the photographs live on it');
    } else if (homeHeroMultiShows !== null) {
      if (declaresHero && !homeHeroMultiShows) {
        errors.push('homeHero: manifest declares supports.heroImagery but the rendered section neither displays the images fixture nor places the hero_carousel island');
      }
      if (declaresHero && !homeHeroSingleShows) {
        errors.push('homeHero: supports.heroImagery must render a SINGLE photograph directly (images[0], treated, never raw), the carousel island only covers 2+');
      }
      if (!declaresHero && (homeHeroMultiShows || homeHeroSingleShows)) {
        errors.push('homeHero: renders the hero photographs but the manifest does not declare supports.heroImagery, declare it so the choosers can badge it');
      }
    }
  }

  if (manifest?.supports?.worship && !manifest?.supports?.layout) {
    errors.push('manifest: supports.worship requires supports.layout, the worship rail is layout chrome');
  }
  if (manifest?.supports?.navigationHighlights && !manifest?.supports?.layout) {
    errors.push('manifest: supports.navigationHighlights requires supports.layout, highlights belong to navigation chrome');
  }
  if (manifest?.supports?.layout) {
    if (!has('layout.liquid')) {
      errors.push('layout: manifest declares supports.layout but layout.liquid is missing');
    } else {
      let parsedLayout;
      try {
        parsedLayout = liquid.parse(read('layout.liquid'));
      } catch (e) {
        errors.push(`layout: does not parse under the dialect, ${e.message}`);
      }
      if (parsedLayout) {
        try {
          const html = await liquid.render(parsedLayout, {
            site: siteFx,
            brand: contextContract.fixtures.brand,
            nav: contextContract.fixtures.layout.nav,
            socials: contextContract.fixtures.layout.socials ?? [],
            worship: contextContract.fixtures.layout.worship ?? null,
            locale: contextContract.fixtures.layout.locale
          });
          let contentSlots = 0;
          const layoutIslands = [];
          for (const part of splitIslandParts(html)) {
            if (part.island === CONTENT_SLOT) contentSlots++;
            else if (part.island) { placedIslands.add(part.island); layoutIslands.push(part.island); }
          }
          if (contentSlots !== 1) {
            errors.push(`layout: must contain exactly one {% content %} slot (found ${contentSlots})`);
          }
          if (!layoutIslands.includes('member_menu')) {
            warnings.push("layout: no {% island 'member_menu' %}, member sign-in will be unreachable on tenants that allow sign-ups; place it in your header");
          }

          const highlights = await proveNavigationHighlights((nav) => liquid.render(parsedLayout, {
            site: { ...siteFx, nav },
            brand: contextContract.fixtures.brand,
            nav,
            socials: contextContract.fixtures.layout.socials ?? [],
            worship: contextContract.fixtures.layout.worship ?? null,
            locale: contextContract.fixtures.layout.locale
          }), manifest?.supports?.navigationHighlights);
          errors.push(...highlights.errors);
          warnings.push(...highlights.warnings);

          const worshipProbe = contextContract.fixtures.layout.worship?.times?.[0]?.name;
          if (worshipProbe) {
            const rendersWorship = html.includes(worshipProbe);
            if (manifest?.supports?.worship && !rendersWorship) {
              errors.push('layout: manifest declares supports.worship but the rendered layout does not display the worship fixture times, the rail never appears');
            }
            if (!manifest?.supports?.worship && rendersWorship) {
              errors.push('layout: renders the worship rail but the manifest does not declare supports.worship, declare it so the choosers can badge it');
            }
            if (manifest?.supports?.worship) {
              const nullHtml = await liquid.render(parsedLayout, {
                site: siteFx,
                brand: contextContract.fixtures.brand,
                nav: contextContract.fixtures.layout.nav,
                socials: contextContract.fixtures.layout.socials ?? [],
                worship: null,
                site: { ...siteFx, content: { ...siteFx.content, schedules: [] } },
                locale: contextContract.fixtures.layout.locale
              });
              if (nullHtml.includes(worshipProbe)) {
                errors.push('layout: worship rail content appears even when `worship` is null, always branch on it (tenants without a schedule must not see a rail)');
              }
            }
          }
        } catch (e) {
          errors.push(`layout: failed rendering the layout fixture, ${e.message}`);
        }
      }
    }
  } else if (has('layout.liquid')) {
    warnings.push('layout.liquid present but manifest.supports.layout is not true, it will be ignored');
  }

  for (const pageName of manifest?.supports?.pageTemplates ?? []) {
    const fixture = contextContract.fixtures.pages?.[pageName];
    if (!fixture) {
      errors.push(`page template '${pageName}': no such page in the contract (no fixtures.pages.${pageName})`);
      continue;
    }
    const pageFile = `pages/${pageName}.liquid`;
    if (!has(pageFile)) {
      errors.push(`page template '${pageName}': declared in supports.pageTemplates but pages/${pageName}.liquid is missing`);
      continue;
    }
    let parsedPage;
    try {
      parsedPage = liquid.parse(read(pageFile));
    } catch (e) {
      errors.push(`page template '${pageName}': does not parse under the dialect, ${e.message}`);
      continue;
    }
    try {
      const html = await liquid.render(parsedPage, { ...fixture, site: siteFx, brand: contextContract.fixtures.brand });
      for (const part of splitIslandParts(html)) {
        if (part.island === CONTENT_SLOT) {
          errors.push(`page template '${pageName}': uses {% content %}, that tag is layout-only`);
        } else if (part.island) {
          placedIslands.add(part.island);
        }
      }
    } catch (e) {
      errors.push(`page template '${pageName}': failed rendering the page fixture, ${e.message}`);
    }
  }

  for (const name of placedIslands) {
    if (!declaredIslands.has(name)) {
      errors.push(`island '${name}': placed in a section but not declared in manifest.supports.islands`);
    }
  }
  for (const name of declaredIslands) {
    if (!allIslands.has(name)) {
      errors.push(`island '${name}': not in the platform island registry`);
    } else if (!availableIslands.has(name)) {
      warnings.push(`island '${name}': registry status is 'planned', it will render nothing until available`);
    }
  }

  if (!has('assets/theme.css') || read('assets/theme.css').trim() === '') {
    errors.push('assets/theme.css missing or empty, a template must ship its look');
  }

  {
    const css = has('assets/theme.css') ? read('assets/theme.css') : '';
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const RULE = /([^{}]+)\{([^{}]*)\}/g;
    for (const rule of layoutContract.rules ?? []) {
      if (rule.kind !== 'css-width-off-token') continue;
      const token = rule.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sizesOffToken = new RegExp(`\\b(?:min-|max-)?(?:width|inline-size)\\s*:[^;]*var\\(\\s*${token}\\b`);
      const isSeam = new RegExp(`\\.(?:${rule.allow.join('|')})(?![\\w-])`);
      const offenders = new Set();
      let m;
      RULE.lastIndex = 0;
      while ((m = RULE.exec(stripped)) !== null) {
        if (!sizesOffToken.test(m[2])) continue;
        for (const sel of m[1].split(',')) {
          const s = sel.trim();
          if (s && !isSeam.test(s)) offenders.add(s);
        }
      }
      for (const sel of [...offenders].sort()) {
        errors.push(`theme: selector '${sel}' ${rule.message}`);
      }
    }
  }

  if (contentAnalysis.footprint.includes('content.events')) {
    const futureEvent = {
      ...(siteFx.content.events[0] ?? {}),
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      name: 'Open Enum Probe Event',
      registrationMode: 'X_FUTURE_MODE',
      detailHref: '/events?event=ffffffff-ffff-4fff-8fff-ffffffffffff'
    };
    const doctored = { ...siteFx, content: { ...siteFx.content, events: [...siteFx.content.events, futureEvent] } };
    for (const type of manifest?.supports?.sections ?? []) {
      const file = `sections/${type}.liquid`;
      if (!has(file) || !/\bsite\s*[.[]/.test(read(file))) continue;
      try {
        const html = await liquid.render(liquid.parse(read(file)), {
          section: catalogueByType.get(type)?.sample ?? {},
          brand: contextContract.fixtures.brand,
          site: doctored
        });
        if (/\bundefined\b|\bnull\b/.test(html.replace(/data-[a-z-]+="[^"]*"/g, ''))) {
          errors.push(`section '${type}': renders 'undefined'/'null' literals for an unknown event registrationMode, the enum is OPEN, branch on the modes you style and fall back for the rest`);
        }
      } catch (e) {
        errors.push(`section '${type}': failed rendering an unknown event registrationMode, the enum is OPEN and new modes will arrive (${e.message})`);
      }
    }
  }

  return { errors, warnings, manifest, contentFootprint: contentAnalysis.footprint, minContentVersion: contentAnalysis.minModelVersion };
}
