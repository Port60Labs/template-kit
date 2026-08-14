// The `site` tree for validator and preview renders (content model v1 — contract/v1/
// content-model.json): ONE realistic organisation assembled from the canonical fixtures, with
// `site.content.about` composed per-template from the section catalogue's samples for the
// manifest's declared sections — the admin-authored page composition, previewed honestly.
import contextContract from '../contract/v1/context.json' with { type: 'json' };
import sectionCatalogue from '../contract/v1/sections.json' with { type: 'json' };

export { contentModel, extractContentFootprint } from '../engine/content-footprint.mjs';
import { contentModel } from '../engine/content-footprint.mjs';

/** The canonical site fixture with `about` composed for this manifest's declared sections. */
export function buildSiteFixture(manifest) {
  const base = contextContract.fixtures.site;
  const catalogueByType = new Map(sectionCatalogue.sections.map((s) => [s.type, s]));
  const about = (manifest?.supports?.sections ?? [])
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

export function validatePreviewContent(json) {
  const errors = [];
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return ['preview-content.json: must be an object of { collection: [items] } overrides'];
  }
  for (const [name, items] of Object.entries(json)) {
    // `brand` is the one non-collection override: the organisation's own name and marks.
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
  return { ...site, brand, content };
}
