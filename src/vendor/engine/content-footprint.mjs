// CONTENT FOOTPRINTS (content model v1 — docs/template-content-model.md): which site.* paths a
// template touches, decidable at publish because the dialect is closed. Lives in the ENGINE so
// the production loader computes the same footprint the validator stamps — the render path
// fetches precisely what a template reads, and the two can never disagree.
import contentModel from '../contract/v1/content-model.json' with { type: 'json' };

export { contentModel };

// ── Extraction ─────────────────────────────────────────────────────────
// The dialect is closed, so the site paths a template reads are decidable from its sources: every
// reference is a literal `site.…` chain (dynamic indexing is refused below, and aliasing the tree
// itself is refused so a chain can never hide behind a variable). The footprint is collection-
// granular — `content.events` — because item fields ride the collection fetch.

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
 * Returns { footprint: string[], minModelVersion: string|null, errors: string[] } — footprint
 * entries are 'brand' | 'nav' | 'socials' | 'locale' | 'content.<collection>'.
 */
export function extractContentFootprint(files) {
  const errors = [];
  const touched = new Set();
  const siblings = new Set(contentModel.siblings.keys);
  const collections = contentModel.collections;

  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith('.liquid')) continue;
    if (DYNAMIC_INDEX.test(source)) {
      errors.push(`${path}: dynamic indexing into site.* is refused — the content footprint must be decidable at publish. Read a named collection instead.`);
    }
    if (BARE_SITE.test(source)) {
      errors.push(`${path}: aliasing or outputting the bare site tree is refused — reference a named path (site.brand, site.content.<collection>) so the footprint stays decidable.`);
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
          errors.push(`${path}: references site.content without a collection — name the collection (the footprint must be decidable).`);
          continue;
        }
        const collection = segs[1];
        if (!collections[collection]) {
          errors.push(`${path}: site.content.${collection} is not in content model ${contentModel.version} — see contract/v1/content-model.json for the collections that exist.`);
          continue;
        }
        touched.add(`content.${collection}`);
      } else {
        errors.push(`${path}: site.${head} is not part of the content model — site carries brand, nav, socials, locale and content.*.`);
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

