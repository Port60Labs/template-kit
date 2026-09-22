// CONTENT FOOTPRINTS (content model v1, docs/template-content-model.md): which site.* paths a
// template touches, decidable at publish because the dialect is closed. Lives in the ENGINE so
// the production loader computes the same footprint the validator stamps, the render path
// fetches precisely what a template reads, and the two can never disagree.
import contentModel from '../contract/v1/content-model.json' with { type: 'json' };
import contentModelV2 from '../contract/v2/content-model.json' with { type: 'json' };
import siteSchemaV2 from '../contract/v2/site.schema.json' with { type: 'json' };

export { contentModel };
export { contentModelV2 };

// ── Extraction ─────────────────────────────────────────────────────────
// The dialect is closed, so the site paths a template reads are decidable from its sources: every
// reference is a literal `site.…` chain (dynamic indexing is refused below, and aliasing the tree
// itself is refused so a chain can never hide behind a variable). The footprint is collection-
// granular, `content.events`, because item fields ride the collection fetch.

const CHAIN = /\bsite((?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\s*'[^']*'\s*\]|\[\s*"[^"]*"\s*\])+)/g;
const DYNAMIC_INDEX = /\bsite(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\s*(?:'[^']*'|"[^"]*")\s*\])*\[\s*(?!\s*['"])[^\]]/;
const BARE_SITE = /\bsite\s*(?:\}\}|\|)|(?:\bassign\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*|\bfor\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+)site\s*(?:%\}|\.\s*%\})/;

function segmentsOf(chain) {
  const segs = [];
  const re = /\.([A-Za-z_][A-Za-z0-9_-]*)|\[\s*'([^']*)'\s*\]|\[\s*"([^"]*)"\s*\]/g;
  let m;
  while ((m = re.exec(chain)) !== null) segs.push(m[1] ?? m[2] ?? m[3]);
  return segs;
}

/**
 * Extract the content footprint from the artifact's liquid sources.
 * Returns { footprint: string[], minModelVersion: string|null, errors: string[] }, footprint
 * entries are 'brand' | 'nav' | 'socials' | 'locale' | 'content.<collection>'.
 */
function extractV1ContentFootprint(files) {
  const errors = [];
  const touched = new Set();
  const siblings = new Set(contentModel.siblings.keys);
  const collections = contentModel.collections;

  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith('.liquid')) continue;
    if (DYNAMIC_INDEX.test(source)) {
      errors.push(`${path}: dynamic indexing into site.* is refused, the content footprint must be decidable at publish. Read a named collection instead.`);
    }
    if (BARE_SITE.test(source)) {
      errors.push(`${path}: aliasing or outputting the bare site tree is refused, reference a named path (site.brand, site.content.<collection>) so the footprint stays decidable.`);
    }
    let m;
    CHAIN.lastIndex = 0;
    while ((m = CHAIN.exec(source)) !== null) {
      const segs = segmentsOf(m[1]);
      if (segs.length === 0) continue;
      const head = segs[0];
      if (siblings.has(head)) {
        touched.add(head);
      } else if (head === 'content') {
        if (segs.length < 2) {
          errors.push(`${path}: references site.content without a collection, name the collection (the footprint must be decidable).`);
          continue;
        }
        const collection = segs[1];
        if (!collections[collection]) {
          errors.push(`${path}: site.content.${collection} is not in content model ${contentModel.version}, see contract/v1/content-model.json for the collections that exist.`);
          continue;
        }
        touched.add(`content.${collection}`);
      } else {
        errors.push(`${path}: site.${head} is not part of the content model, site carries brand, nav, socials, locale and content.*.`);
      }
    }
  }

  const versions = [...touched]
    .filter((t) => t.startsWith('content.'))
    .map((t) => collections[t.slice('content.'.length)].since);
  const minModelVersion = versions.length
    ? versions.sort((a, b) => Number(b.split('.')[1] ?? 0) - Number(a.split('.')[1] ?? 0))[0]
    : null;
  return { footprint: [...touched].sort(), minModelVersion, errors };
}

/** Metadata-only collection reads do not require fetching the collection's records. */
export function needsCollectionData(footprint, name) {
  return footprint.includes(`content.${name}`);
}

function artifactFormat(files) {
  try { return JSON.parse(files['manifest.json'] ?? '{}').format ?? 'port60-liquid@1'; }
  catch { return 'port60-liquid@1'; }
}

/** The same explicit major decision is used by validation and the public host. */
export function extractContentFootprint(files, options = {}) {
  const format = options.format ?? artifactFormat(files);
  if (format === 'port60-liquid@1') return extractV1ContentFootprint(files);
  if (format !== 'port60-liquid@2') return { footprint: [], minModelVersion: null, errors: [`Unsupported content-model format '${format}'.`] };
  const errors = [];
  const touched = new Set();
  const siblings = new Set(contentModelV2.siblings.keys);
  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith('.liquid')) continue;
    const code = source.replace(/\{%[-]?\s*comment\s*[-]?%\}[\s\S]*?\{%[-]?\s*endcomment\s*[-]?%\}/g, '');
    const bindings = new Set([...code.matchAll(/\b(?:assign|for)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:=|in)\s+/g)].map(match => match[1]));
    for (const token of code.matchAll(/\{(?:\{[\s\S]*?\}\}|%[\s\S]*?%\})/g)) {
      for (const match of token[0].matchAll(/(?<![.\w])\b(brand|nav|socials|locale|worship|focus|events|infoEvents|latestArticles|campaigns|campaignsLabel|causes|services|courses|resources|locations|relatedArticles|backHref)(?=\.|\[|\s*(?:%\}|\}\}|\|))/g)) {
        if (!bindings.has(match[1])) errors.push(`${path}: flat context '${match[1]}' is not available in v2; read the canonical site tree.`);
      }
    }
    if (DYNAMIC_INDEX.test(source)) errors.push(`${path}: dynamic indexing into site.* is refused; use a named path.`);
    if (BARE_SITE.test(source)) errors.push(`${path}: aliasing the bare site tree is refused; use a named path.`);
    for (const match of source.matchAll(new RegExp(CHAIN.source, 'g'))) {
      const [head, member, ...rest] = segmentsOf(match[1]);
      if (head === 'content') {
        const collection = contentModelV2.collections[member];
        if (!collection) {
          errors.push(`${path}: site.content.${member ?? ''} is not in content model 2.0. Use the canonical collection or site.page.`);
          continue;
        }
        if (collection.shape === 'array') {
          touched.add(`content.${member}`);
          continue;
        }
        const field = rest[0];
        if (field && !['label', 'href', 'items', 'pagination'].includes(field)) {
          errors.push(`${path}: site.content.${member} is an envelope with label, href, items and pagination; '${field}' is not a member.`);
          continue;
        }
        if (field === 'items') {
          const itemField = ['first', 'last'].includes(rest[1]) ? rest[2] : rest[1];
          if (itemField && !['size', 'first', 'last'].includes(itemField) && !collection.item[itemField]) errors.push(`${path}: '${itemField}' is not a ${member} item field.`);
          touched.add(`content.${member}`);
        } else {
          if (field === 'pagination' && rest[1] && !['page', 'size', 'totalElements', 'totalPages', 'nextHref', 'previousHref'].includes(rest[1])) errors.push(`${path}: '${rest[1]}' is not a pagination field.`);
          touched.add(field ? `content.${member}.${field}` : `content.${member}`);
        }
      } else if (siblings.has(head)) {
        const properties = siteSchemaV2.properties[head]?.properties;
        if (member && properties && !properties[member]) errors.push(`${path}: site.${head}.${member} is not part of the v2 model.`);
        touched.add(head);
      } else errors.push(`${path}: site.${head} is not part of the v2 model.`);
    }
    // Local aliases of nav/collection objects are valid. Retired members are not.
    const retired = [
      [/\b(?:site\.)?nav\.(?:items|derived)\b/, 'nav.header and nav.footer replace nav.items/nav.derived'],
      [/\b(?:site\.)?actions\.(?:primary|secondary)\b/, 'actions.header, actions.hero and actions.widget replace action aliases'],
      [/\bsection\.(?:primary|secondary)\b/, 'use site.actions rather than section action aliases'],
      [/\bmegaMenu\.columns\b|\.megaMenu\.columns\b/, 'the template owns responsive menu columns'],
      [/\b(?:item|link|child|node|navItem)\.cta\b/, 'navigation CTA flags are retired; use site.actions.header']
    ];
    for (const [pattern, advice] of retired) if (pattern.test(source)) errors.push(`${path}: ${advice}.`);
  }
  return { footprint: [...touched].sort(), minModelVersion: touched.size ? '2.0' : null, errors };
}
