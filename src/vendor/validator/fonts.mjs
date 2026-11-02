import catalogue from '../contract/v1/fonts.json' with { type: 'json' };

const byName = new Map(catalogue.families.map((f) => [f.name, f]));

export const FONT_PROVIDER_ORIGIN = new URL(catalogue.provider.cssBase).origin;

/** A catalogue-valid family name, else null. */
export function knownFamily(name) {
  return typeof name === 'string' && byName.has(name) ? name : null;
}

/** The platform's Arabic faces, the same rule and order as the engine's fonts.ts: the preview base
 *  stylesheet (a generated copy of global.css) declares each as a unicode-range @font-face, so every
 *  slot names them first unless the chosen family is itself an Arabic one. */
export const ARABIC_FACES = ['KFGQPC HAFS Uthmanic Script', 'IBM Plex Sans Arabic'];
const ARABIC_PREFIX = ARABIC_FACES.map((f) => `'${f}'`).join(', ');

/** The CSS font-family value for a slot: the platform Arabic faces (unless the family IS an Arabic
 *  one), the quoted family, then its honest generic fallback. */
export function fontStackFor(name) {
  const family = byName.get(name);
  if (!family) return `${ARABIC_PREFIX}, '${name}', sans-serif`;
  const arabicFirst = family.category === 'arabic' ? '' : `${ARABIC_PREFIX}, `;
  return `${arabicFirst}'${family.name}', ${family.stack}`;
}

function nearestWeight(target, available) {
  let best = available[0];
  for (const w of available) {
    const d = Math.abs(w - target);
    const bestD = Math.abs(best - target);
    if (d < bestD || (d === bestD && w > best)) best = w;
  }
  return best;
}

/** One css2 URL per chosen family at its slots' clamped weights. The provider answers a
 *  multi-family request from a cache keyed on its first family, so one family per request. */
export function fontCssHrefs(slots) {
  const weightsByFamily = new Map();
  for (const slot of slots) {
    const family = byName.get(slot.family);
    if (!family || family.hosted) continue;
    const set = weightsByFamily.get(family.name) ?? new Set();
    const asked = slot.weights?.length > 0 ? slot.weights : [400, 700];
    for (const weight of asked) set.add(nearestWeight(weight, family.weights));
    weightsByFamily.set(family.name, set);
  }
  return [...weightsByFamily.entries()].map(([name, weights]) =>
    `${catalogue.provider.cssBase}?family=${name.replace(/ /g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}&display=swap`);
}

/** A template's own Google Fonts URL on the mirror (same css2 API), one URL per family. */
export function toProviderHrefs(url) {
  const [base, query = ''] = String(url).replace('https://fonts.googleapis.com/', `${FONT_PROVIDER_ORIGIN}/`).split('?', 2);
  const params = query.split('&').filter(Boolean);
  const families = params.filter(param => param.startsWith('family='));
  const shared = params.filter(param => !param.startsWith('family='));
  if (families.length < 2) return [query ? `${base}?${query}` : base];
  return families.map(family => `${base}?${[family, ...shared].join('&')}`);
}
