// Font-slot resolution for the DEV preview, the same rules as the engine's fonts.ts: the template
// declares font knobs (slot, default family, the weights its type system uses); a chosen family
// becomes a --p60s-<key> variable with an honest fallback stack and ONE stylesheet URL for every
// chosen family at the slot's weights, clamped to the family's real weights. Served from the
// catalogue's provider (Bunny Fonts, the privacy-first mirror of the Google catalogue).
import catalogue from '../contract/v1/fonts.json' with { type: 'json' };

const byName = new Map(catalogue.families.map((f) => [f.name, f]));

export const FONT_PROVIDER_ORIGIN = new URL(catalogue.provider.cssBase).origin;

/** A catalogue-valid family name, else null. */
export function knownFamily(name) {
  return typeof name === 'string' && byName.has(name) ? name : null;
}

/** The CSS font-family value for a slot: quoted family plus its honest generic fallback. */
export function fontStackFor(name) {
  const family = byName.get(name);
  return family ? `'${family.name}', ${family.stack}` : `'${name}', sans-serif`;
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

/** One css2 URL covering every chosen family at its slot's clamped weights, or null. */
export function fontCssHref(slots) {
  const weightsByFamily = new Map();
  for (const slot of slots) {
    const family = byName.get(slot.family);
    if (!family) continue;
    const set = weightsByFamily.get(family.name) ?? new Set();
    const asked = slot.weights?.length > 0 ? slot.weights : [400, 700];
    for (const weight of asked) set.add(nearestWeight(weight, family.weights));
    weightsByFamily.set(family.name, set);
  }
  if (weightsByFamily.size === 0) return null;
  const parts = [...weightsByFamily.entries()].map(([name, weights]) =>
    `family=${name.replace(/ /g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}`);
  return `${catalogue.provider.cssBase}?${parts.join('&')}&display=swap`;
}

/** A template's own Google Fonts URL, rewritten to the mirror (same css2 API). */
export function toProvider(url) {
  return String(url).replace('https://fonts.googleapis.com/', `${FONT_PROVIDER_ORIGIN}/`);
}
