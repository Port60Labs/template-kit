import catalogue from '../contract/v1/fonts.json' with { type: 'json' };
import faces from '../engine/font-faces.json' with { type: 'json' };
import { declaredFontSlots, fontFaceRules, fontFilePath, fontStoreBase, fontStoreUrl } from '../engine/font-faces.mjs';

const byName = new Map(catalogue.families.map((f) => [f.name, f]));

const FONT_STORE_BASE = fontStoreBase(null, catalogue.provider.base);
export const FONT_STORE = fontStoreUrl(faces, FONT_STORE_BASE);
export const FONT_STORE_ORIGIN = new URL(FONT_STORE).origin;

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

export function fontFaceCss(slots) {
  return fontFaceRules(faces, slots, FONT_STORE).join('');
}

export function declaredFonts(urls) {
  return (urls ?? []).flatMap((url) => declaredFontSlots(faces, url));
}

export function storedFontFile(url) {
  return fontFilePath(faces, url, FONT_STORE_BASE);
}
