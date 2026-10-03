import { INTRO_PHOTO_FRAMING_ATTRIBUTE as ATTRIBUTE } from '../engine/section-fields.mjs';
import { parsePresentationMarkup, presentationSignature, presentationVisible } from './presentation-proof.mjs';

const ROOT = '(?:[a-z][\\w-]*)?(?:\\.[\\w-]+)*';
const SELECTOR = new RegExp(`^(?:(${ROOT})\\s+)?(img(?:\\.[\\w-]+)*)\\[${ATTRIBUTE}\\s*=\\s*(?:"(fill|whole)"|'(fill|whole)'|(fill|whole))\\s*\\]$`);
const RATIOS = new Set(['1/1', '4/3', '3/2', '16/9', '2/1']);
const decodeCss = value => value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, character) =>
  hex ? String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)) : character);

/** Framing changes only the actual image's crop and bounded ratio, never arbitrary geometry. */
export function introPhotoFramingRules(css) {
  const rules = [], errors = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const scopes = [];
  let start = 0, quote = null;
  for (let index = 0; index < clean.length; index++) {
    if (clean[index] === '\\') { index++; continue; }
    if (quote) { if (clean[index] === quote) quote = null; continue; }
    if (clean[index] === '"' || clean[index] === "'") { quote = clean[index]; continue; }
    if (clean[index] === '{') {
      const header = clean.slice(start, index).trim();
      if (decodeCss(header).toLowerCase().includes(ATTRIBUTE) && scopes.some(scope => !/^@(media|container)\b/.test(scope))) {
        errors.push('photoFraming selectors must be flat; only media/container conditions may surround them');
      }
      if (scopes.some(scope => decodeCss(scope).toLowerCase().includes(ATTRIBUTE))) errors.push('photoFraming rules must not contain nested rules');
      scopes.push(header); start = index + 1;
    } else if (clean[index] === '}') { scopes.pop(); start = index + 1; }
  }
  for (const [, selectors, body] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!decodeCss(selectors).toLowerCase().includes(ATTRIBUTE)) continue;
    for (const selector of selectors.split(',')) {
      const match = SELECTOR.exec(selector.trim());
      if (!match) { errors.push('photoFraming CSS must target only the actual img token, optionally prefixed by its natural root tag/classes'); continue; }
      const token = match[3] ?? match[4] ?? match[5];
      const declarations = new Map();
      for (const part of body.split(';').map(value => value.trim()).filter(Boolean)) {
        const declaration = /^([a-z-]+)\s*:\s*(.+)$/.exec(part);
        const property = declaration?.[1], value = declaration?.[2].trim();
        if (!((property === 'object-fit' && value === (token === 'fill' ? 'cover' : 'contain'))
          || (property === 'aspect-ratio' && (token === 'fill' ? RATIOS.has(value.replace(/\s/g, '')) : value === 'auto')))) {
          errors.push('photoFraming CSS allows only object-fit cover/contain and bounded fill aspect-ratio (1/1, 4/3, 3/2, 16/9, 2/1), or auto for whole');
          continue;
        }
        declarations.set(property, value);
      }
      rules.push({ root: match[1], image: match[2], token, declarations });
    }
  }
  return { rules, errors: [...new Set(errors)] };
}

function matches(node, selector) {
  const tag = /^[a-z][\w-]*/i.exec(selector)?.[0];
  return (!tag || node.tag === tag) && [...selector.matchAll(/\.([\w-]+)/g)].every(([, name]) => (node.attrs.class ?? '').split(/\s+/).includes(name));
}
function matchingRule(rule, image) {
  if (!matches(image, rule.image)) return false;
  if (!rule.root) return true;
  for (let node = image.parent; node; node = node.parent) if (matches(node, rule.root)) return true;
  return false;
}
function inIsland(node) {
  for (let parent = node; parent; parent = parent.parent) if (parent.tag === 'astro-island' || Object.hasOwn(parent.attrs, 'data-p60-island')) return true;
  return false;
}

export async function proveIntroPhotoFraming(render, entry, css) {
  const { rules, errors } = introPhotoFramingRules(css);
  const photo = { ...structuredClone(entry.sample), imageUrl: 'https://example.invalid/framing-photo.jpg', imageAlt: 'Framing fixture' };
  let baseline;
  for (const value of [undefined, 'fill', 'whole', null, 'unknown', undefined]) {
    try {
      const content = { ...photo, ...(value === undefined ? {} : { photoFraming: value }) };
      const parsed = parsePresentationMarkup(await render(content));
      const hooks = parsed.nodes.filter(node => Object.hasOwn(node.attrs, ATTRIBUTE));
      const image = hooks[0];
      if (hooks.length !== 1 || image.tag !== 'img' || !presentationVisible(image) || inIsland(image)
        || image.attrs['data-p60-field'] !== 'imageUrl' || image.attrs.src !== photo.imageUrl
        || image.attrs[ATTRIBUTE] !== (['fill', 'whole'].includes(value) ? value : '')) {
        errors.push('photoFraming requires one permanent exact token hook on the actual marked photograph, empty when inherited or unsupported');
      } else {
        for (const token of ['fill', 'whole']) {
          const matching = rules.filter(rule => rule.token === token && matchingRule(rule, image));
          for (const property of ['object-fit', 'aspect-ratio']) if (!matching.some(rule => rule.declarations.has(property))) {
            errors.push(`photoFraming '${token}' needs matching image-only ${property} rules`);
          }
        }
      }
      const signature = presentationSignature(parsed.root, node => node === image ? [ATTRIBUTE] : []);
      baseline ??= signature;
      if (signature !== baseline) errors.push('photoFraming must preserve image source, alt text, content, order and markup; only its image hook may change');
    } catch (error) { errors.push(`photoFraming failed rendering fixture: ${error.message}`); return [...new Set(errors)]; }
  }
  for (const value of [undefined, 'fill', 'whole']) {
    try {
      const parsed = parsePresentationMarkup(await render({ ...photo, imageUrl: '', photoFraming: value }));
      if (parsed.nodes.some(node => Object.hasOwn(node.attrs, ATTRIBUTE))) errors.push('photoFraming must not invent an image or hook when no photograph exists');
    } catch (error) { errors.push(`photoFraming failed rendering no-photo fixture: ${error.message}`); return [...new Set(errors)]; }
  }
  return [...new Set(errors)];
}
