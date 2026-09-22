import Ajv from 'ajv';
import context from '../contract/v2/context.json' with { type: 'json' };
import sections from '../contract/v2/sections.json' with { type: 'json' };
import schema from '../contract/v2/site.schema.json' with { type: 'json' };
import contentModel from '../contract/v2/content-model.json' with { type: 'json' };
export { extractContentFootprint } from '../engine/content-footprint.mjs';
export { contentModel };

export const PAGE_KEYS = ['home', 'about'];
const byType = new Map(sections.sections.map(section => [section.type, section]));
const validateSite = new Ajv({ allErrors: true, strict: false }).compile(schema);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Each example section has an identity before it is edited or moved. */
export function composePage(manifest, page) {
  const declared = manifest?.compositions?.[page];
  const types = Array.isArray(declared)
    ? declared.filter(entry => entry?.role !== 'optional').map(entry => entry.type)
    : (manifest?.supports?.sections ?? []).filter(type => byType.get(type)?.pages.includes(page));
  return types.flatMap((type, index) => {
    const entry = byType.get(type);
    return entry ? [{ key: `fixture-${page}-${type}-${index}`, type, content: structuredClone(entry.sample ?? {}) }] : [];
  });
}

export function buildSiteFixture(manifest, { page = 'home', path } = {}) {
  const site = structuredClone(context.fixtures.site);
  site.page = { key: page, path: path ?? (page === 'home' ? '/' : `/${page}`), sections: PAGE_KEYS.includes(page) ? composePage(manifest, page) : [] };
  return site;
}

export function validateSiteFixture(site) {
  const errors = validateSite(site) ? [] : validateSite.errors.map(error => `${error.instancePath || '/'}: ${error.message}`);
  const walk = (items, depth, path) => {
    if (!Array.isArray(items)) return;
    if (depth > 2 && items.length) errors.push(`${path}: navigation may have only two levels below the root`);
    items.forEach((item, index) => walk(item?.children, depth + 1, `${path}/${index}/children`));
  };
  walk(site?.nav?.header, 0, '/nav/header');
  walk(site?.nav?.footer, 0, '/nav/footer');
  return errors;
}

function validatePageSections(value, path, errors) {
  if (!Array.isArray(value)) { errors.push(`${path}: must be an array of keyed sections`); return; }
  const seen = new Set();
  value.forEach((section, index) => {
    const at = `${path}[${index}]`;
    if (!object(section)) { errors.push(`${at}: must be a section object`); return; }
    if (typeof section.key !== 'string' || !section.key || seen.has(section.key)) errors.push(`${at}.key: a unique stable key is required`);
    seen.add(section.key);
    const entry = byType.get(section.type);
    if (!entry) { errors.push(`${at}.type: '${section.type}' is not a v2 section`); return; }
    if (!object(section.content)) { errors.push(`${at}.content: must be an object`); return; }
    const fields = new Map(entry.fields.map(field => [field.name, field]));
    for (const [name, fieldValue] of Object.entries(section.content)) {
      const field = fields.get(name);
      if (!field) { errors.push(`${at}.content.${name}: not an authored ${section.type} field`); continue; }
      if (field.kind === 'items') {
        if (!Array.isArray(fieldValue)) { errors.push(`${at}.content.${name}: must be an array`); continue; }
        const itemFields = new Set(field.itemFields.map(item => item.name));
        fieldValue.forEach((item, itemIndex) => {
          if (!object(item)) { errors.push(`${at}.content.${name}[${itemIndex}]: must be an object`); return; }
          for (const key of Object.keys(item)) if (!itemFields.has(key)) errors.push(`${at}.content.${name}[${itemIndex}].${key}: unknown item field`);
        });
      } else if (typeof fieldValue !== 'string') errors.push(`${at}.content.${name}: must be a string; an empty string intentionally clears optional text`);
    }
  });
}

/** Author overrides replace one whole envelope, never widen public eligibility or add fields. */
export function validatePreviewContent(json) {
  if (!object(json)) return ['preview-content.json: must be an object of v2 overrides'];
  const errors = [];
  const site = buildSiteFixture(null);
  for (const [name, value] of Object.entries(json)) {
    if (['brand', 'nav', 'actions', 'socials', 'locale'].includes(name)) {
      site[name] = name === 'brand' && object(value) ? { ...site.brand, ...value } : value;
    } else if (name === 'pages') {
      if (!object(value)) { errors.push('preview-content.json: pages must be keyed by home or about'); continue; }
      for (const [page, composition] of Object.entries(value)) {
        if (!PAGE_KEYS.includes(page)) errors.push(`preview-content.json: pages.${page} is not an editable page`);
        validatePageSections(composition, `pages.${page}`, errors);
      }
    } else if (Object.hasOwn(contentModel.collections, name)) site.content[name] = value;
    else errors.push(`preview-content.json: '${name}' is not a v2 override; retired aliases cannot be used`);
  }
  return [...errors, ...validateSiteFixture(site).map(error => `preview-content.json: ${error}`)];
}

export function applyPreviewContent(site, json) {
  if (validatePreviewContent(json).length) return site;
  const next = structuredClone(site);
  for (const [name, value] of Object.entries(json)) {
    if (['brand', 'nav', 'actions', 'socials', 'locale'].includes(name)) next[name] = name === 'brand' ? { ...next.brand, ...value } : structuredClone(value);
    else if (Object.hasOwn(contentModel.collections, name)) next.content[name] = structuredClone(value);
  }
  return next;
}

export function pageComposition(manifest, page, json) {
  const override = json?.pages?.[page];
  return Array.isArray(override) ? structuredClone(override) : composePage(manifest, page);
}

/** Keep missing fields missing so a generated label never becomes an authored field marker. */
export function resolveSectionFixture(section, _site) {
  return structuredClone(section.content ?? {});
}

export function emptyCollections(site) {
  return { ...site, content: Object.fromEntries(Object.entries(site.content).map(([name, value]) => [name, Array.isArray(value) ? [] : { ...value, items: [], pagination: null }])) };
}
