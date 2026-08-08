// The Port60 template CONFORMANCE VALIDATOR as a PURE MODULE (developer program T1.3): the same
// checks the publish-time CLI has always run, callable with an in-memory file map — no fs, no
// argv, no process.exit — so the studio upload lane (an HTTP endpoint) and the CLI share ONE
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

import dialect from '../contract/v1/dialect.json' with { type: 'json' };
import sectionCatalogue from '../contract/v1/sections.json' with { type: 'json' };
import islandRegistry from '../contract/v1/islands.json' with { type: 'json' };
import manifestSchema from '../contract/v1/manifest.schema.json' with { type: 'json' };
import contextContract from '../contract/v1/context.json' with { type: 'json' };
import fontCatalogue from '../contract/v1/fonts.json' with { type: 'json' };

const Ajv = Ajv2020.default ?? Ajv2020;

export { dialect as contractDialect, sectionCatalogue, islandRegistry, contextContract };

export async function validateArtifact(files) {
  const errors = [];
  const warnings = [];
  const has = (path) => Object.hasOwn(files, path);
  const read = (path) => files[path];

  // 1. Manifest against the schema.
  let manifest = null;
  if (!has('manifest.json')) {
    return { errors: ['manifest.json is missing — every artifact starts with its manifest'], warnings, manifest };
  }
  try {
    manifest = JSON.parse(read('manifest.json'));
  } catch (e) {
    return { errors: [`manifest.json unreadable: ${e.message}`], warnings, manifest: null };
  }
  const ajv = new Ajv({ allErrors: true });
  const validateManifest = ajv.compile(manifestSchema);
  if (!validateManifest(manifest)) {
    for (const err of validateManifest.errors) {
      errors.push(`manifest${err.instancePath || ''}: ${err.message}`);
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

  // Looks: every value must target a declared knob and be valid for it — a look that half-applies
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

  // 2–4. Sections: catalogue membership, parse, fixture renders.
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
      errors.push(`section '${type}': does not parse under the dialect — ${e.message}`);
      continue;
    }
    for (const fixtureName of ['minimal', 'sample']) {
      const fixture = entry[fixtureName] ?? {};
      try {
        const html = await liquid.render(parsed, {
          section: fixture,
          brand: contextContract.fixtures.brand
        });
        if (type === 'homeHero' && fixtureName === 'sample') {
          const probe = 'Hero photo one';
          homeHeroMultiShows = html.includes(probe)
            || splitIslandParts(html).some((p) => p.island === 'hero_carousel');
          // The single-photo path proven separately: same fixture, first photo only.
          try {
            const single = await liquid.render(parsed, {
              section: { ...fixture, images: (fixture.images ?? []).slice(0, 1) },
              brand: contextContract.fixtures.brand
            });
            homeHeroSingleShows = single.includes(probe);
          } catch {
            homeHeroSingleShows = false;
          }
        }
        for (const part of splitIslandParts(html)) {
          if (part.island === CONTENT_SLOT) {
            errors.push(`section '${type}': uses {% content %} — that tag is layout-only`);
          } else if (part.island) {
            placedIslands.add(part.island);
          }
        }
      } catch (e) {
        errors.push(`section '${type}': failed rendering the ${fixtureName} fixture — ${e.message}`);
      }
    }
  }

  // Hero-imagery honesty, checked BEHAVIOURALLY (the worship pattern). The homeHero sample
  // fixture carries photographs whose data URIs embed a quote-free marker that survives HTML
  // escaping, so "does the rendered hero display the tenant's photos?" is a substring check —
  // and with several photos, placing the hero_carousel island IS displaying them (the island
  // renders the slides at runtime). The single-photo path is proven separately: images[0] must
  // appear directly. Declaration and behaviour must agree; the choosers badge photo-led tenants
  // by supports.heroImagery. Legacy imageUrl-only renderers never match (the fixture's photos
  // ride `images`), so they pass undeclared — they just don't earn the badge.
  {
    const declaresHero = manifest?.supports?.heroImagery === true;
    if (declaresHero && !(manifest?.supports?.sections ?? []).includes('homeHero')) {
      errors.push('manifest: supports.heroImagery requires the homeHero section — the photographs live on it');
    } else if (homeHeroMultiShows !== null) {
      if (declaresHero && !homeHeroMultiShows) {
        errors.push('homeHero: manifest declares supports.heroImagery but the rendered section neither displays the images fixture nor places the hero_carousel island');
      }
      if (declaresHero && !homeHeroSingleShows) {
        errors.push('homeHero: supports.heroImagery must render a SINGLE photograph directly (images[0], treated, never raw) — the carousel island only covers 2+');
      }
      if (!declaresHero && (homeHeroMultiShows || homeHeroSingleShows)) {
        errors.push('homeHero: renders the hero photographs but the manifest does not declare supports.heroImagery — declare it so the choosers can badge it');
      }
    }
  }

  // 7. Layout (when declared): parse + render the layout fixture + exactly one content slot.
  if (manifest?.supports?.worship && !manifest?.supports?.layout) {
    errors.push('manifest: supports.worship requires supports.layout — the worship rail is layout chrome');
  }
  if (manifest?.supports?.layout) {
    if (!has('layout.liquid')) {
      errors.push('layout: manifest declares supports.layout but layout.liquid is missing');
    } else {
      let parsedLayout;
      try {
        parsedLayout = liquid.parse(read('layout.liquid'));
      } catch (e) {
        errors.push(`layout: does not parse under the dialect — ${e.message}`);
      }
      if (parsedLayout) {
        try {
          const html = await liquid.render(parsedLayout, {
            brand: contextContract.fixtures.brand,
            nav: contextContract.fixtures.layout.nav,
            socials: contextContract.fixtures.layout.socials ?? [],
            worship: contextContract.fixtures.layout.worship ?? null
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
            warnings.push("layout: no {% island 'member_menu' %} — member sign-in will be unreachable on tenants that allow sign-ups; place it in your header");
          }

          // Two-sided worship honesty, checked BEHAVIOURALLY: does the rendered layout actually
          // display the worship fixture's times? Declaration and behaviour must agree — the
          // choosers steer worship-enabled tenants by supports.worship, so a false declaration
          // either hides their times (undeclared but rendered is fine to fix by declaring) or
          // promises a rail that never appears.
          const worshipProbe = contextContract.fixtures.layout.worship?.times?.[0]?.name;
          if (worshipProbe) {
            const rendersWorship = html.includes(worshipProbe);
            if (manifest?.supports?.worship && !rendersWorship) {
              errors.push('layout: manifest declares supports.worship but the rendered layout does not display the worship fixture times — the rail never appears');
            }
            if (!manifest?.supports?.worship && rendersWorship) {
              errors.push('layout: renders the worship rail but the manifest does not declare supports.worship — declare it so the choosers can badge it');
            }
            if (manifest?.supports?.worship) {
              const nullHtml = await liquid.render(parsedLayout, {
                brand: contextContract.fixtures.brand,
                nav: contextContract.fixtures.layout.nav,
                socials: contextContract.fixtures.layout.socials ?? [],
                worship: null
              });
              if (nullHtml.includes(worshipProbe)) {
                errors.push('layout: worship rail content appears even when `worship` is null — always branch on it (tenants without a schedule must not see a rail)');
              }
            }
          }
        } catch (e) {
          errors.push(`layout: failed rendering the layout fixture — ${e.message}`);
        }
      }
    }
  } else if (has('layout.liquid')) {
    warnings.push('layout.liquid present but manifest.supports.layout is not true — it will be ignored');
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
      errors.push(`page template '${pageName}': does not parse under the dialect — ${e.message}`);
      continue;
    }
    try {
      const html = await liquid.render(parsedPage, { ...fixture, brand: contextContract.fixtures.brand });
      for (const part of splitIslandParts(html)) {
        if (part.island === CONTENT_SLOT) {
          errors.push(`page template '${pageName}': uses {% content %} — that tag is layout-only`);
        } else if (part.island) {
          placedIslands.add(part.island);
        }
      }
    } catch (e) {
      errors.push(`page template '${pageName}': failed rendering the page fixture — ${e.message}`);
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
      warnings.push(`island '${name}': registry status is 'planned' — it will render nothing until available`);
    }
  }

  // 6. Theme.
  if (!has('assets/theme.css') || read('assets/theme.css').trim() === '') {
    errors.push('assets/theme.css missing or empty — a template must ship its look');
  }

  return { errors, warnings, manifest };
}
