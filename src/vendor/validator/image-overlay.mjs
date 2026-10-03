import { SECTION_PRESENTATION_CONTROLS, SECTION_ROOT_TAGS } from '../engine/section-presentation.mjs';
import { parsePresentationMarkup, presentationSignature, presentationText } from './presentation-proof.mjs';

const ATTRIBUTE = SECTION_PRESENTATION_CONTROLS.imageOverlay.attribute;
const MEDIA = 'data-p60-image-overlay-media';
const LAYER = 'data-p60-image-overlay-layer';
const ISLAND = '\u0000P60_ISLAND:hero_carousel\u0000';
const descendants = node => [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : descendants(child))];
const contains = (parent, node) => descendants(parent).includes(node);
const overlayRules = css => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selectors]) => /\[data-p60-image-overlay(?:\s*=|\])/.test(selectors));

function matchesCompound(node, selector) {
  const parts = selector.match(/\[[^\]]+\]|[.#][\w-]+|^[\w-]+/g) ?? [];
  if (!parts.length || parts.join('') !== selector) return false;
  return parts.every(part => {
    if (part[0] === '.') return (node.attrs.class ?? '').split(/\s+/).includes(part.slice(1));
    if (part[0] === '#') return node.attrs.id === part.slice(1);
    if (part[0] !== '[') return node.tag === part.toLowerCase();
    const match = /^\[([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\]$/.exec(part);
    if (!match || !Object.hasOwn(node.attrs, match[1])) return false;
    const expected = match[2] ?? match[3] ?? match[4];
    return expected === undefined || node.attrs[match[1]] === expected;
  });
}

/** Small deliberate descendant/child grammar matching the bounded author selector contract. */
function matchesSelector(node, selector) {
  const parts = selector.match(/(?:\[[^\]]+\]|[^\s>])+|>/g) ?? [];
  const match = (current, index) => {
    if (!current || !matchesCompound(current, parts[index])) return false;
    if (index === 0) return true;
    if (parts[index - 1] === '>') return match(current.parent, index - 2);
    for (let parent = current.parent; parent; parent = parent.parent) if (match(parent, index - 1)) return true;
    return false;
  };
  return parts.length > 0 && match(node, parts.length - 1);
}

function mediaHasRule(owner, rules) {
  const descendantsInMedia = descendants(owner);
  const candidates = descendantsInMedia.filter(node => Object.hasOwn(node.attrs, LAYER));
  // The real platform island supplies this documented empty class after the fragment renders.
  if (presentationText(owner).includes(ISLAND)) candidates.push({ tag: 'span', attrs: { class: 'hero-slide-scrim' }, parent: owner, children: [] });
  return rules.some(([, selectors]) => selectors.split(',').some(selector => {
    const match = /::(?:before|after)\s*$/.exec(selector);
    if (match) return matchesSelector(owner, selector.slice(0, match.index).trim());
    return candidates.some(node => matchesSelector(node, selector.trim()));
  }));
}

/** The token belongs to the existing hero; treatment markers belong only to its photographs. */
export function inspectImageOverlay(html, expected, required, hasImages, css = '', declaration) {
  const parsed = parsePresentationMarkup(html);
  const roots = parsed.root.children.filter(child => typeof child !== 'string');
  const hooks = parsed.nodes.filter(node => Object.hasOwn(node.attrs, ATTRIBUTE));
  const media = parsed.nodes.filter(node => Object.hasOwn(node.attrs, MEDIA));
  const errors = [];
  if (required && hooks.length !== 1) errors.push('one permanent data-p60-image-overlay hook is required on the existing first outer hero root');
  for (const hook of hooks) {
    if (hook !== roots[0] || !SECTION_ROOT_TAGS.includes(hook.tag) || hook.parent !== parsed.root) errors.push('imageOverlay must target the existing first outer hero root, not an image, heading or island');
    if (hook.attrs[ATTRIBUTE] !== (expected ?? '')) errors.push('imageOverlay must render its exact accepted token, or an empty inherited hook');
  }
  if (required && hasImages && !media.length) errors.push('imageOverlay needs an existing photo-only data-p60-image-overlay-media wrapper in every image branch');
  for (const owner of media) {
    const nodes = descendants(owner);
    const text = presentationText(owner);
    const hasIsland = text.includes(ISLAND);
    if (!['div', 'figure', 'span'].includes(owner.tag) || hooks.length !== 1 || !contains(hooks[0], owner)
      || !nodes.some(node => node.tag === 'img') && !hasIsland
      || text.replaceAll(ISLAND, '').trim()
      || nodes.some(node => !['div', 'figure', 'picture', 'source', 'img', 'span'].includes(node.tag))) {
      errors.push('imageOverlay media markers must contain photographs and decorative empty layers only, never copy, links or transactional islands');
    }
    if (required && expected && expected !== declaration?.default && declaration && !mediaHasRule(owner, overlayRules(css))) {
      errors.push(`imageOverlay '${expected}' needs matching background CSS for every rendered photo treatment, including static and carousel branches`);
    }
  }
  for (const layer of parsed.nodes.filter(node => Object.hasOwn(node.attrs, LAYER))) {
    if (!['span', 'div'].includes(layer.tag) || layer.children.some(child => typeof child !== 'string' || child.trim())
      || !media.some(owner => owner !== layer && contains(owner, layer))) {
      errors.push('data-p60-image-overlay-layer must mark an empty decorative layer inside its photo wrapper, never the image or its parent');
    }
  }
  return { errors: [...new Set(errors)], signature: presentationSignature(parsed.root, () => [ATTRIBUTE]) };
}

/** Deliberately narrow CSS grammar: no image opacity, filters, geometry or unrelated targets. */
export function imageOverlayCssErrors(css, declaration) {
  const rules = overlayRules(css);
  const errors = [], covered = new Set();
  const rootToken = /\[data-p60-image-overlay\s*=\s*(?:"(subtle|standard|strong)"|'(subtle|standard|strong)'|(subtle|standard|strong))\s*\]/;
  const target = /(?:\[data-p60-image-overlay-layer\]|\[data-p60-image-overlay-media\]::(?:before|after)|\[data-p60-image-overlay-media\]\s+\.hero-slide-scrim)\s*$/;
  for (const [, selectors, body] of rules) {
    const declarations = body.split(';').map(part => part.trim()).filter(Boolean);
    if (!declarations.length || declarations.some(part => !/^background(?:-image|-color)?\s*:\s*[^;]+$/i.test(part)
      || !/var\(\s*--[\w-]+/.test(part) || /(?:url|image-set|attr|expression)\s*\(/i.test(part))) {
      errors.push('imageOverlay token CSS may change only palette-derived background treatments, never opacity, filters, images, geometry, typography or custom properties');
    }
    for (const selector of selectors.split(',')) {
      const token = rootToken.exec(selector);
      const remainder = token ? selector.slice(token.index + token[0].length) : '';
      if (!token || !/^\s+/.test(remainder) || !target.test(remainder)
        || /[+~]|:not\(|:is\(|:where\(|\*/.test(selector)
        || (selector.match(/data-p60-image-overlay(?=[\s=\]])/g) ?? []).length !== 1) {
        errors.push('imageOverlay CSS must target a marked decorative layer, marked photo-wrapper pseudo-element or its documented hero-slide-scrim beneath the exact root token');
      } else covered.add(token[1] ?? token[2] ?? token[3]);
    }
  }
  for (const option of declaration?.options ?? []) {
    if (option !== declaration.default && !covered.has(option)) errors.push(`imageOverlay '${option}' needs an authored marked-layer background rule; the inherited default alone may omit an override`);
  }
  return [...new Set(errors)];
}

/** Exercise each distinct photo branch with the real manifest-aware render function. */
export async function proveImageOverlay(render, fixture, declaration, css, limit = 6) {
  const required = Array.isArray(declaration?.options) && declaration.options.length > 0;
  const errors = imageOverlayCssErrors(css, declaration);
  const samples = fixture.content.images?.length ? fixture.content.images : [{ imageUrl: 'p60fixture:hero/dusk', alt: 'A photograph' }];
  const counts = required ? [...new Set([0, 1, Math.min(2, limit), limit]), 'legacy'] : [1];
  for (const count of counts) for (const framing of ['fill', 'whole']) {
    const content = { ...fixture.content, imageUrl: count === 'legacy' ? samples[0].imageUrl : '', photoFraming: framing,
      images: Array.from({ length: count === 'legacy' ? 0 : count }, (_, index) => ({ ...samples[index % samples.length], alt: `Overlay photograph ${index + 1}` })) };
    let baseline;
    for (const value of [undefined, ...SECTION_PRESENTATION_CONTROLS.imageOverlay.options, 'unknown', undefined]) {
      try {
        const html = await render({ ...content, ...(value === undefined ? {} : { presentation: { imageOverlay: value } }) });
        const expected = declaration?.options?.includes(value) ? value : undefined;
        const result = inspectImageOverlay(html, expected, required, count === 'legacy' || count > 0, css, declaration);
        errors.push(...result.errors.map(error => `${count} photos ${framing} ${value ?? 'inherited'}: ${error}`));
        baseline ??= result.signature;
        if (baseline !== result.signature) errors.push(`${count} photos ${framing} ${value ?? 'inherited'}: imageOverlay must not change content, photographs, islands or markup outside its root token`);
      } catch (error) {
        errors.push(`failed rendering imageOverlay fixture, ${error.message}`);
        return { errors, failed: true };
      }
    }
  }
  return { errors: [...new Set(errors)], failed: false };
}
