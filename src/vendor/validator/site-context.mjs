// The `site` tree for validator and preview renders (content model v1 — contract/v1/
// content-model.json): ONE realistic organisation assembled from the canonical fixtures, with
// `site.content.about` composed per-template from the section catalogue's samples for the
// manifest's declared sections — the admin-authored page composition, previewed honestly.
import contextContract from '../contract/v1/context.json' with { type: 'json' };
import sectionCatalogue from '../contract/v1/sections.json' with { type: 'json' };

export { contentModel, extractContentFootprint } from '../engine/content-footprint.mjs';
import { contentModel } from '../engine/content-footprint.mjs';

const catalogueByType = new Map(sectionCatalogue.sections.map((s) => [s.type, s]));

/** The section-based pages the contract knows (manifest supports.pages values). */
export const PAGE_KEYS = ['home', 'about'];

/**
 * A page's default composition for this manifest: the declared sections the catalogue assigns to
 * that page, in manifest order, each with its sample content. This is what the kit preview renders
 * for /home and /about and what `content` ejects, so an author edits copy in place; a production
 * site's composition is admin-authored, and the preview-content `pages` block plays that role.
 */
export function composePage(manifest, page) {
  return (manifest?.supports?.sections ?? [])
    .map((type) => {
      const entry = catalogueByType.get(type);
      return entry && (entry.pages ?? []).includes(page) ? { type, content: entry.sample ?? {} } : null;
    })
    .filter(Boolean);
}

/** The canonical site fixture with `about` composed for this manifest's declared sections (every
 *  declared section when no page is named, the page's own composition when one is). */
export function buildSiteFixture(manifest, { page = null } = {}) {
  const base = contextContract.fixtures.site;
  const about = page
    ? composePage(manifest, page)
    : (manifest?.supports?.sections ?? [])
      .map((type) => {
        const entry = catalogueByType.get(type);
        return entry ? { type, content: entry.sample ?? {} } : null;
      })
      .filter(Boolean);
  return { ...base, content: { ...base.content, about } };
}

// ── preview-content.json (author-editable data) ────────────────────────────────
// Data is free, SHAPE is fixed: a collection override must be an array of items whose fields all
// exist in the model, within the collection's cap. Proofs always run on the canonical fixtures,
// so custom data can never dodge a gate; this file only feeds the dev preview.

const BRAND_FIELDS = new Set(['name', 'tagline', 'logoUrl', 'logoType', 'footerLogoUrl']);
const NAV_ITEM_FIELDS = new Set(['label', 'href', 'cta', 'children', 'group', 'description', 'imageUrl', 'megaMenu', 'type']);

function validateNavItems(items, path, errors, depth = 0) {
  if (!Array.isArray(items)) {
    errors.push(`preview-content.json: ${path} must be an array of menu items`);
    return;
  }
  items.forEach((item, i) => {
    const at = `${path}[${i}]`;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`preview-content.json: ${at} must be an object`);
      return;
    }
    for (const field of Object.keys(item)) {
      if (!NAV_ITEM_FIELDS.has(field)) errors.push(`preview-content.json: ${at}.${field} does not exist on a menu item (${[...NAV_ITEM_FIELDS].join(', ')})`);
    }
    if (typeof item.label !== 'string' || !item.label) errors.push(`preview-content.json: ${at}.label is required`);
    if (typeof item.href !== 'string') errors.push(`preview-content.json: ${at}.href is required`);
    if (item.children !== undefined) {
      if (depth >= 2) errors.push(`preview-content.json: ${at}.children nests deeper than the platform renders`);
      else validateNavItems(item.children, `${at}.children`, errors, depth + 1);
    }
  });
}

/** A page composition entry against the section catalogue: the type must exist and its content
 *  fields must be ones the section declares (items entries against itemFields). */
function validatePageSections(sections, path, errors) {
  if (!Array.isArray(sections)) {
    errors.push(`preview-content.json: ${path} must be an array of { type, content } sections`);
    return;
  }
  sections.forEach((section, i) => {
    const at = `${path}[${i}]`;
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
      errors.push(`preview-content.json: ${at} must be an object with type and content`);
      return;
    }
    const entry = catalogueByType.get(section.type);
    if (!entry) {
      errors.push(`preview-content.json: ${at}.type '${section.type}' is not a section in the catalogue`);
      return;
    }
    const content = section.content ?? {};
    if (content === null || typeof content !== 'object' || Array.isArray(content)) {
      errors.push(`preview-content.json: ${at}.content must be an object`);
      return;
    }
    const fields = new Map((entry.fields ?? []).map((f) => [f.name, f]));
    for (const [name, value] of Object.entries(content)) {
      const field = fields.get(name);
      if (!field) {
        errors.push(`preview-content.json: ${at}.content.${name} is not a field of the ${section.type} section`);
        continue;
      }
      if (field.kind === 'items' && Array.isArray(value)) {
        const itemFields = new Set((field.itemFields ?? []).map((f) => f.name));
        value.forEach((item, j) => {
          if (item && typeof item === 'object') {
            for (const k of Object.keys(item)) {
              if (!itemFields.has(k)) errors.push(`preview-content.json: ${at}.content.${name}[${j}].${k} is not an item field of the ${section.type} section`);
            }
          }
        });
      }
    }
  });
}

export function validatePreviewContent(json) {
  const errors = [];
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return ['preview-content.json: must be an object of { collection: [items] } overrides'];
  }
  for (const [name, items] of Object.entries(json)) {
    // `nav` is the menu the layout renders (the shape of site.nav), `pages` the section
    // compositions of the home and about pages (the admin-authored composition, previewed).
    if (name === 'nav') {
      if (items === null || typeof items !== 'object' || Array.isArray(items)) {
        errors.push('preview-content.json: nav must be an object with an items array');
        continue;
      }
      for (const field of Object.keys(items)) {
        if (field !== 'items') errors.push(`preview-content.json: nav.${field} does not exist — nav carries items`);
      }
      validateNavItems(items.items, 'nav.items', errors);
      continue;
    }
    if (name === 'pages') {
      if (items === null || typeof items !== 'object' || Array.isArray(items)) {
        errors.push('preview-content.json: pages must be an object keyed by page (home, about)');
        continue;
      }
      for (const [page, sections] of Object.entries(items)) {
        if (!PAGE_KEYS.includes(page)) {
          errors.push(`preview-content.json: pages.${page} is not a section-based page (${PAGE_KEYS.join(', ')})`);
          continue;
        }
        validatePageSections(sections, `pages.${page}`, errors);
      }
      continue;
    }
    // `brand` is the one other non-collection override: the organisation's own name and marks.
    if (name === 'brand') {
      if (items === null || typeof items !== 'object' || Array.isArray(items)) {
        errors.push('preview-content.json: brand must be an object');
        continue;
      }
      for (const field of Object.keys(items)) {
        if (!BRAND_FIELDS.has(field)) {
          errors.push(`preview-content.json: brand.${field} does not exist — brand carries ${[...BRAND_FIELDS].join(', ')}`);
        }
      }
      continue;
    }
    const model = contentModel.collections[name];
    if (!model) {
      errors.push(`preview-content.json: '${name}' is not a content collection (see contract/v1/content-model.json)`);
      continue;
    }
    if (!Array.isArray(items)) {
      errors.push(`preview-content.json: '${name}' must be an array`);
      continue;
    }
    if (items.length > model.cap) {
      errors.push(`preview-content.json: '${name}' holds ${items.length} items — the collection is bounded at ${model.cap}`);
    }
    items.forEach((item, i) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`preview-content.json: ${name}[${i}] must be an object`);
        return;
      }
      for (const field of Object.keys(item)) {
        if (!model.item[field]) {
          errors.push(`preview-content.json: ${name}[${i}].${field} does not exist in the model — a field that does not exist in production cannot exist in a preview`);
        }
      }
      for (const [field, spec] of Object.entries(model.item)) {
        const value = item[field];
        if (value == null) continue;
        const kind = spec.type === 'string[]' ? 'array' : spec.type;
        const actual = Array.isArray(value) ? 'array' : typeof value;
        if (kind !== 'object' && actual !== kind) {
          errors.push(`preview-content.json: ${name}[${i}].${field} should be ${spec.type}`);
        }
      }
    });
  }
  return errors;
}

/** Overlay validated preview content onto a site fixture (collections replaced wholesale). */
export function applyPreviewContent(site, json) {
  if (!json || typeof json !== 'object') return site;
  const content = { ...site.content };
  for (const [name, items] of Object.entries(json)) {
    if (contentModel.collections[name] && Array.isArray(items)) content[name] = items;
  }
  const brand = json.brand && typeof json.brand === 'object' && !Array.isArray(json.brand)
    ? { ...site.brand, ...json.brand }
    : site.brand;
  const nav = json.nav && typeof json.nav === 'object' && Array.isArray(json.nav.items)
    ? { ...site.nav, items: json.nav.items }
    : site.nav;
  return { ...site, brand, nav, content };
}

/** The composition to render for a page: the override's, else the manifest's default. */
export function pageComposition(manifest, page, json) {
  const override = json?.pages?.[page];
  return Array.isArray(override) ? override.map((s) => ({ type: s.type, content: s.content ?? {} })) : composePage(manifest, page);
}
