// The Port60 template CONFORMANCE VALIDATOR as a PURE MODULE (developer program T1.3): the same
// checks the publish-time CLI has always run, callable with an in-memory file map, no fs, no
// argv, no process.exit, so the studio upload lane (an HTTP endpoint) and the CLI share ONE
// implementation, and "validated ⇒ renders in production" keeps holding: the Liquid instance is
// configured identically to the engine's, dialect enforcement is the same shared module, and the
// render budgets here match production's.
//
//   validateArtifact(files) → { errors: string[], warnings: string[], manifest: object|null }
//
// `files` is a plain object of artifact-relative path → string content (manifest.json,
// layout.liquid, sections/*.liquid, pages/*.liquid, assets/theme.css).
import { Liquid } from 'liquidjs';
import Ajv2020 from 'ajv/dist/2020.js';
import { CONTENT_SLOT, configureDialect, splitIslandParts } from '../engine/dialect.mjs';
import { LIQUID_BUDGETS } from '../engine/budgets.mjs';

import dialect from '../contract/v2/dialect.json' with { type: 'json' };
import sectionCatalogue from '../contract/v2/sections.json' with { type: 'json' };
import islandRegistry from '../contract/v2/islands.json' with { type: 'json' };
import manifestSchema from '../contract/v2/manifest.schema.json' with { type: 'json' };
import contextContract from '../contract/v2/context.json' with { type: 'json' };
import fontCatalogue from '../contract/v2/fonts.json' with { type: 'json' };
import layoutContract from '../contract/v2/layout.json' with { type: 'json' };
import behaviourCatalogue from '../contract/v2/behaviours.json' with { type: 'json' };
import { buildSiteFixture, extractContentFootprint, contentModel, emptyCollections, resolveSectionFixture } from './site-context-v2.mjs';
import { proveNavigationHighlights } from './navigation-highlights.mjs';

const Ajv = Ajv2020.default ?? Ajv2020;

export { dialect as contractDialect, sectionCatalogue, islandRegistry, contextContract, behaviourCatalogue };

// The behaviour to opt-in-attribute map is DERIVED from the catalogue (FR-5): `primaryAttribute` on
// each entry feeds the checks below, the generated reference and the kit, so adding a behaviour is
// one catalogue entry plus its runtime initialiser. The trailing word boundary keeps the original
// semantics: a companion attribute that starts with the primary one (data-p60-reveal-group,
// data-p60-nav-item) counts as the behaviour in use.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const BEHAVIOUR_PRIMARY_ATTR = Object.fromEntries(
  behaviourCatalogue.behaviours.map((b) => [b.name, b.primaryAttribute])
);
const PRIMARY_ATTR = Object.fromEntries(
  behaviourCatalogue.behaviours.map((b) => [b.name, [new RegExp(`${escapeRegExp(b.primaryAttribute)}\\b`), b.primaryAttribute]])
);

// Templates are markup and attributes, NEVER code (docs/template-behaviours.md). These are hard
// errors over the RAW liquid source, even inside comments, because there is no legitimate reason
// for the tokens to appear at all. The handler pattern names real DOM event families rather than
// matching any on* word, so attributes like `once` or `online` never false-positive.
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

  // 1. Manifest against the schema.
  let manifest = null;
  if (!has('manifest.json')) {
    return { errors: ['manifest.json is missing, every artifact starts with its manifest'], warnings, manifest };
  }
  try {
    manifest = JSON.parse(read('manifest.json'));
  } catch (e) {
    return { errors: [`manifest.json unreadable: ${e.message}`], warnings, manifest: null };
  }
  // preview-content.json is a DEV-ONLY data override: package excludes it and the intake
  // refuses it, an artifact must never carry data, only shape.
  if (has('preview-content.json')) {
    errors.push('preview-content.json: development preview data never ships in an artifact, remove it (package excludes it automatically)');
  }

  // Content model v1: the footprint is decidable from the sources (closed dialect); unknown
  // paths, dynamic indexing and tree aliasing are errors from site-context.mjs.
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

  // Capability declarations are catalogue MATCHING metadata, not an entitlement shortcut. Keep
  // them honest by requiring one corresponding template-facing surface. The mapping is deliberately
  // structural: it proves the design can present a capability without inspecting tenant data or
  // crossing the platform-owned transaction, identity and consent boundaries.
  {
    const sections = new Set(manifest?.supports?.sections ?? []);
    const islands = new Set(manifest?.supports?.islands ?? []);
    const pages = new Set(manifest?.supports?.pageTemplates ?? []);
    const hasAny = (values, expected) => expected.some((value) => values.has(value));
    const capabilitySurface = {
      giving: () => islands.has('donation_widget'),
      appeals: () => hasAny(sections, ['appealGrid', 'emergency']) || islands.has('donation_widget'),
      worship: () => manifest?.supports?.worship === true || islands.has('next_prayer'),
      courses: () => sections.has('courses') || pages.has('courses') || pages.has('course') || islands.has('course_enrol'),
      membership: () => islands.has('member_menu'),
      events: () => sections.has('events') || pages.has('events'),
      articles: () => sections.has('articles') || hasAny(pages, ['articles', 'article']),
      services: () => sections.has('services') || pages.has('services'),
      forms: () => islands.has('form'),
      documents: () => sections.has('documents'),
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

  // Site focus honesty (docs/volunteering.md): a template that claims it can lead with
  // volunteering must give the volunteer sign-up a way into the hero, either the
  // primary_action_widget island (which becomes the sign-up when volunteering leads) or the
  // volunteer_signup island placed directly.
  {
    const focusKinds = new Set(manifest?.supports?.focus ?? []);
    if (focusKinds.has('volunteer')) {
      const liquidSource = Object.entries(files).filter(([path]) => path.endsWith('.liquid')).map(([, s]) => s).join('\n');
      if (!/island\s+['"]primary_action_widget['"]/.test(liquidSource) && !/island\s+['"]volunteer_signup['"]/.test(liquidSource)) {
        errors.push("manifest: supports.focus lists 'volunteer' but no section places {% island 'primary_action_widget' %} (or 'volunteer_signup'), so the site could never lead with volunteering");
      }
    }
  }

  // Markup and attributes, NEVER code, the machine-enforced JavaScript ban over every liquid
  // source (docs/template-behaviours.md). Behaviour is engine-owned; a template wanting motion
  // declares supports.behaviors and uses the data-p60-* grammar.
  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith('.liquid')) continue;
    for (const [pattern, what] of FORBIDDEN_MARKUP) {
      if (pattern.test(source)) {
        errors.push(`${path}: contains ${what}, templates are markup and attributes, never code (behaviour is engine-owned; see the behaviour catalogue)`);
      }
    }
  }

  // Behaviour declaration and usage must agree in BOTH directions. Source-level, deliberately:
  // usage often sits inside content-dependent branches the fixtures never take, so the grammar's
  // presence in the source is the honest minimal proof.
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

  // Font knobs: the default family must be a real catalogue entry (the tenant-unset render uses
  // it), and the slot must declare the weights the template's typographic system needs.
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

  // Looks: every value must target a declared knob and be valid for it, a look that half-applies
  // would leave the tenant in a state no author designed.
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

  // Engine identical to production: escape-by-default, strict filters, restricted dialect,
  // and the SAME DoS budgets the live renderer runs with.
  const availableIslands = new Set(
    islandRegistry.islands.filter((i) => i.status === 'available').map((i) => i.name)
  );
  const allIslands = new Set(islandRegistry.islands.map((i) => i.name));
  const liquid = new Liquid({ outputEscape: 'escape', strictFilters: true, ...LIQUID_BUDGETS });
  configureDialect(liquid, dialect, allIslands);

  const catalogueByType = new Map(sectionCatalogue.sections.map((s) => [s.type, s]));
  const declaredIslands = new Set(manifest?.supports?.islands ?? []);
  const placedIslands = new Set();
  // heroImagery proof state (filled by the homeHero renders below).
  let homeHeroMultiShows = null; // sample (several photos): probe in html OR hero_carousel placed
  let homeHeroSingleShows = null; // single-photo variant: probe rendered directly

  // V2 collection sections render the supplied bounded envelopes, without independently
  // fetching legacy display islands. The populated fixture's sentinel must appear, and the
  // empty context must render it away (derive or omit, nothing invented, nothing dangling).
  // Sentinels are DERIVED from the canonical fixtures (the first item's display field), never
  // hardcoded, the fixture data is free to become richer without touching a proof, and a proof
  // can never drift from the data it renders.
  const sentinelOf = (type, field) => siteFx.content[type]?.items?.[0]?.[field] ?? null;
  const WIDGET_SECTIONS = {
    events: { island: null, dataKey: 'events', sentinel: sentinelOf('events', 'name') },
    articles: { island: null, dataKey: 'articles', sentinel: sentinelOf('articles', 'title') },
    campaigns: { island: null, dataKey: 'campaigns', sentinel: sentinelOf('campaigns', 'title') },
    services: { island: null, dataKey: 'services', sentinel: sentinelOf('services', 'title') },
    courses: { island: null, dataKey: 'courses', sentinel: sentinelOf('courses', 'title') },
    documents: { island: null, dataKey: 'documents', sentinel: sentinelOf('documents', 'title') }
  };

  // 2b. Compositions (site editor stage 4): each page must be a supported page, each type a
  // supported section the catalogue assigns to that page, listed once, with a role.
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

  // 2-4. Sections: catalogue membership, parse, fixture renders.
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
    // Widget-section proof (independent of the minimal/sample loop): island placed → the island
    // owns everything; hand-rendered → sentinel appears with data, vanishes without.
    const widget = WIDGET_SECTIONS[type];
    if (widget) {
      const dataFixture = contextContract.fixtures.sections?.[type] ?? {};
      try {
        const populated = await liquid.render(parsed, {
          section: resolveSectionFixture({ type, content: {} }, siteFx),
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
            site: emptyCollections(siteFx),
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
          section: resolveSectionFixture({ type, content: fixture }, siteFx),
          site: siteFx,
          // Widget data rides the ordinary fixture renders too, so a hand-rendering section
          // doesn't fail the generic pass for want of its context.
          ...(widget ? (contextContract.fixtures.sections?.[type] ?? {}) : {})
        });
        if (type === 'homeHero' && fixtureName === 'sample') {
          // The sample's own first image reference is the probe: `p60fixture:` refs are quote-free
          // and survive HTML escaping, so "does the hero display the photos?" stays a substring check.
          const probe = (fixture.images ?? [])[0]?.imageUrl ?? 'p60fixture:';
          homeHeroMultiShows = html.includes(probe)
            || splitIslandParts(html).some((p) => p.island === 'hero_carousel');
          // The single-photo path proven separately: same fixture, first photo only.
          try {
            const single = await liquid.render(parsed, {
              section: { ...fixture, images: (fixture.images ?? []).slice(0, 1) },
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

  // 5. FIELD MARKERS: which node shows which field, so the editor can put the caret on the page
  // instead of in a side panel. Source-level, like behaviours: a marker often sits inside a
  // content-dependent branch the fixtures never take, and its presence in the source is the honest
  // proof. A marker is an address inside that section's own content: `title`, or `items.0.label`
  // for a list, where the index is usually a Liquid expression and stands for any position.
  {
    const MARKER = /data-p60-field="([^"]*)"/g;
    const fieldsOf = (type) => new Map((catalogueByType.get(type)?.fields ?? []).map((f) => [f.name, f]));
    const marked = [];
    for (const type of manifest?.supports?.sections ?? []) {
      const source = has(`sections/${type}.liquid`) ? read(`sections/${type}.liquid`) : '';
      const fields = fieldsOf(type);
      for (const [, raw] of source.matchAll(MARKER)) {
        marked.push(type);
        // An index written as Liquid stands for whichever item this is.
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

  // Hero-imagery honesty, checked BEHAVIOURALLY (the worship pattern). The homeHero sample
  // fixture carries photographs whose data URIs embed a quote-free marker that survives HTML
  // escaping, so "does the rendered hero display the tenant's photos?" is a substring check,
  // and with several photos, placing the hero_carousel island IS displaying them (the island
  // renders the slides at runtime). The single-photo path is proven separately: images[0] must
  // appear directly. Declaration and behaviour must agree; the choosers badge photo-led tenants
  // by supports.heroImagery. Legacy imageUrl-only renderers never match (the fixture's photos
  // ride `images`), so they pass undeclared, they just don't earn the badge.
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

  // 7. Layout (when declared): parse + render the layout fixture + exactly one content slot.
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
            site: { ...siteFx, nav: { header: nav.items.map(item => ({ ...item, kind: 'link', children: item.children.map(child => ({ ...child, kind: 'link' })) })), footer: [] } },
          }), manifest?.supports?.navigationHighlights);
          errors.push(...highlights.errors);
          warnings.push(...highlights.warnings);

          // Two-sided worship honesty, checked BEHAVIOURALLY: does the rendered layout actually
          // display the worship fixture's times? Declaration and behaviour must agree, the
          // choosers steer worship-enabled tenants by supports.worship, so a false declaration
          // either hides their times (undeclared but rendered is fine to fix by declaring) or
          // promises a rail that never appears.
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
                site: { ...siteFx, content: { ...siteFx.content, schedules: [] } },
              });
              if (nullHtml.includes(worshipProbe)) {
                errors.push('layout: worship rail content appears when site.content.schedules is empty; tenants without a schedule must not see a rail');
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

  // 8. Page templates (when declared): file exists, parses, renders the page's data fixture.
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
      const pageSite = { ...siteFx, page: { key: pageName, path: '/' + pageName, sections: [] } };
      if (pageSite.content[pageName]?.items && fixture.collection) pageSite.content = { ...pageSite.content, [pageName]: fixture.collection };
      const html = await liquid.render(parsedPage, { ...(['article', 'course'].includes(pageName) ? fixture : {}), site: pageSite });
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

  // 5. Island discipline: placed ⊆ declared ⊆ registry (and available).
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

  // 6. Theme.
  if (!has('assets/theme.css') || read('assets/theme.css').trim() === '') {
    errors.push('assets/theme.css missing or empty, a template must ship its look');
  }

  // 6b. Layout contract (contract/v1/layout.json). Platform pages render through the content SEAM
  // (.container / .full); a template STYLES those to place content, never a parallel content container.
  // The rule is DATA, the seam token, the allowed selectors and the message all come from the contract
  // file; this only implements the check KIND (a non-seam selector sizing its width off the token).
  {
    const css = has('assets/theme.css') ? read('assets/theme.css') : '';
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, ' '); // drop comments so an example can't trip it
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
        if (!sizesOffToken.test(m[2])) continue; // only rules that size a box off the token
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

  // Open enums, proven survivable (content model v1 discipline 2): a template whose footprint
  // reads site.content.events must survive a registration mode it has never heard of, new modes
  // WILL arrive within the major. No throw, and no undefined/null literal leaking into markup.
  if (contentAnalysis.footprint.includes('content.events')) {
    const futureEvent = {
      ...(siteFx.content.events.items[0] ?? {}),
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      name: 'Open Enum Probe Event',
      registrationMode: 'X_FUTURE_MODE',
      detailHref: '/events?event=ffffffff-ffff-4fff-8fff-ffffffffffff'
    };
    const doctored = { ...siteFx, content: { ...siteFx.content, events: { ...siteFx.content.events, items: [...siteFx.content.events.items, futureEvent] } } };
    for (const type of manifest?.supports?.sections ?? []) {
      const file = `sections/${type}.liquid`;
      if (!has(file) || !/\bsite\s*[.[]/.test(read(file))) continue;
      try {
        const html = await liquid.render(liquid.parse(read(file)), {
          section: catalogueByType.get(type)?.sample ?? {},
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
