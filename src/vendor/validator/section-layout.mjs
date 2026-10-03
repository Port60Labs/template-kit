import { SECTION_ROOT_TAGS, sectionLayoutInteractiveMedia } from '../engine/section-presentation.mjs';
import { parsePresentationMarkup, presentationSignature, presentationVisible, presentationText } from './presentation-proof.mjs';

const ATTRIBUTE = 'data-p60-section-layout';
const MEDIA = 'data-p60-layout-has-media';
const ROLE = 'data-p60-layout-role';
const ROLES = ['frame', 'media', 'content'];
const ROOT = '(?:[a-z][\\w-]*)?(?:\\.[\\w-]+)*';
const TOKEN = '\\[data-p60-section-layout\\s*=\\s*(?:"(image-start|image-end|stacked)"|\'(image-start|image-end|stacked)\'|(image-start|image-end|stacked))\\s*\\]';
const OWNED = '\\[data-p60-layout-role\\s*=\\s*(?:"(frame|media|content)"|\'(frame|media|content)\'|(frame|media|content))\\s*\\]';
const SELECTOR = new RegExp(`^${ROOT}${TOKEN}\\[${MEDIA}\\](?:\\s+${OWNED})?$`);
const cssIdentifier = value => value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, character) =>
  hex ? String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)) : character);
const mentionsLayout = value => cssIdentifier(value).toLowerCase().includes(ATTRIBUTE);

function hasNestedLayoutRule(css) {
  const scopes = [];
  let start = 0, quote = null;
  for (let index = 0; index < css.length; index++) {
    const character = css[index];
    if (character === '\\') { index++; continue; }
    if (quote) { if (character === quote) quote = null; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '{') {
      if (scopes.some(Boolean)) return true;
      scopes.push(mentionsLayout(css.slice(start, index)));
      start = index + 1;
    } else if (character === '}') {
      scopes.pop();
      start = index + 1;
    }
  }
  return false;
}

function safeDeclaration(property, value, role) {
  if (['frame', null].includes(role)) {
    if (property === 'display') return value === 'grid';
    if (property === 'grid-template-rows') return /^(?:auto|auto\s+auto)$/.test(value);
    if (property === 'grid-template-columns') {
      const fraction = '(?:[1-9]\\d*(?:\\.\\d+)?|0?\\.\\d*[1-9]\\d*)fr';
      const track = `(?:minmax\\(0,\\s*${fraction}\\)|${fraction})`;
      return new RegExp(`^${track}(?:\\s+${track})?$`).test(value);
    }
    return false;
  }
  return ['grid-column', 'grid-row'].includes(property) && /^(?:auto|1|2|1\s*\/\s*-1)$/.test(value);
}

/** Only the existing grid and its two owned slots may move. No arbitrary CSS targets. */
export function sectionLayoutRules(css) {
  const rules = [], errors = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (hasNestedLayoutRule(clean)) errors.push('sectionLayout rules must use explicit flat scoped selectors; nested rules and nested at-rules are not supported');
  for (const [, selectors, body] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!mentionsLayout(selectors)) continue;
    for (const selector of selectors.split(',')) {
      const match = SELECTOR.exec(selector.trim());
      if (!match) {
        errors.push('sectionLayout CSS must target the exact root token with data-p60-layout-has-media and an optional documented frame, media or content role');
        continue;
      }
      const role = match[4] ?? match[5] ?? match[6] ?? null;
      const declarations = new Map();
      for (const part of body.split(';').map(value => value.trim()).filter(Boolean)) {
        const declaration = /^([a-z-]+)\s*:\s*(.+)$/.exec(part);
        if (!declaration || !safeDeclaration(declaration[1], declaration[2].trim(), role)) {
          errors.push('sectionLayout CSS may change only bounded grid tracks on the frame and grid-column/grid-row on media/content; no sizing, gaps, paint, order, positioning, typography or priority overrides');
          continue;
        }
        declarations.set(declaration[1], declaration[2].trim());
      }
      if (!declarations.size) errors.push('sectionLayout needs effective grid declarations, not only a changing marker');
      rules.push({ token: match[1] ?? match[2] ?? match[3], role, root: selector.trim().split('[')[0], declarations });
    }
  }
  return { rules, errors: [...new Set(errors)] };
}

export function sectionLayoutCssErrors(css, declaration) {
  const { rules, errors } = sectionLayoutRules(css);
  if (declaration?.options?.length && !rules.length) errors.push('sectionLayout needs authored grid rules');
  return errors;
}

function matchesRoot(node, selector) {
  const tag = /^[a-z][\w-]*/i.exec(selector)?.[0];
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
  return (!tag || node.tag === tag.toLowerCase()) && classes.every(name => (node.attrs.class ?? '').split(/\s+/).includes(name));
}

function layoutErrors(rules, declaration, frameIsRoot) {
  const errors = [], signatures = new Set();
  if (rules.some(rule => rule.token === declaration?.default)) errors.push('sectionLayout default must keep inherited CSS exactly; do not author a token override for the default');
  for (const token of declaration?.options?.filter(value => value !== declaration.default) ?? []) {
    const current = rules.filter(rule => rule.token === token);
    const coverage = role => new Map(current.filter(rule => rule.role === role).flatMap(rule => [...rule.declarations]));
    if (!coverage(frameIsRoot ? null : 'frame').has('grid-template-columns')) errors.push(`sectionLayout '${token}' needs authored grid-template-columns on its actual frame`);
    for (const role of ['media', 'content']) if (!coverage(role).has('grid-column') || !coverage(role).has('grid-row')) {
      errors.push(`sectionLayout '${token}' needs independent grid-column and grid-row placement for its ${role} slot`);
    }
    const signature = JSON.stringify(current.map(rule => [rule.role, [...rule.declarations].sort()]).sort());
    if (signatures.has(signature)) errors.push('sectionLayout options must not repeat identical grid rules');
    signatures.add(signature);
  }
  return errors;
}

/** No layout token may invent, remove, reorder or replace content or platform islands. */
export function inspectSectionLayout(html, expected, required, css, declaration, { imageUrl } = {}) {
  const parsed = parsePresentationMarkup(html);
  const roots = parsed.root.children.filter(node => typeof node !== 'string');
  const hooks = parsed.nodes.filter(node => Object.hasOwn(node.attrs, ATTRIBUTE));
  const roles = parsed.nodes.filter(node => Object.hasOwn(node.attrs, ROLE));
  const errors = [];
  const empty = !roots.length && !presentationText(parsed.root);
  if (required && empty && imageUrl) errors.push('sectionLayout must render its authored photograph fixture');
  if (required && !empty && hooks.length !== 1) errors.push('one permanent data-p60-section-layout hook is required on the natural outer section root');
  for (const hook of hooks) {
    if (roots.length !== 1 || hook !== roots[0] || !SECTION_ROOT_TAGS.includes(hook.tag) || !presentationVisible(hook)
      || parsed.root.children.some(node => typeof node === 'string' && node.trim())) errors.push('sectionLayout must target the single visible natural outer section root');
    if (hook.attrs[ATTRIBUTE] !== (expected ?? '')) errors.push('sectionLayout must render its exact accepted token or an empty inherited hook');
  }
  if (required && (parsed.nodes.some(node => node.tag === 'astro-island' || Object.hasOwn(node.attrs, 'data-p60-island'))
    || /\u0000P60_ISLAND:/.test(html))) errors.push('sectionLayout does not support sections containing platform islands in this slice');
  if (required && !empty && hooks.length === 1) {
    const hook = hooks[0];
    const frame = roles.filter(node => node.attrs[ROLE] === 'frame');
    const media = roles.filter(node => node.attrs[ROLE] === 'media');
    const content = roles.filter(node => node.attrs[ROLE] === 'content');
    if (roles.some(node => !ROLES.includes(node.attrs[ROLE]) || !presentationVisible(node))) errors.push('sectionLayout roles must be visible authored frame, media or content slots');
    if (Object.hasOwn(hook.attrs, MEDIA) !== (media.length > 0)) errors.push('data-p60-layout-has-media must be present exactly when the authored media slot exists');
    if (media.length || imageUrl) {
      if (frame.length !== 1 || media.length !== 1 || content.length !== 1 || media[0].parent !== frame[0] || content[0].parent !== frame[0]
        || frame[0].children.some(node => typeof node === 'string' ? node.trim() : ![media[0], content[0]].includes(node))) {
        errors.push('sectionLayout requires one existing frame with only direct sibling media and content slots');
      }
      const images = parsed.nodes.filter(node => node.tag === 'img' && node.attrs.src && presentationVisible(node));
      const inMedia = node => {
        for (let parent = node; parent; parent = parent.parent) if (parent === media[0]) return true;
        return false;
      };
      if (media[0] && (presentationText(media[0]) || parsed.nodes.some(node => inMedia(node)
        && sectionLayoutInteractiveMedia(node.tag, node.attrs)))) {
        errors.push('sectionLayout media must contain only the photograph and decorative treatment, never copy, actions or interactive content');
      }
      if (!images.some(node => {
        return inMedia(node) && (!imageUrl || node.attrs.src === imageUrl);
      })) errors.push('sectionLayout media must contain the actual authored photograph, never a placeholder');
      const rules = sectionLayoutRules(css).rules.filter(rule => matchesRoot(hook, rule.root));
      errors.push(...layoutErrors(rules, declaration, frame[0] === hook));
    } else if (frame.length > 1 || content.length > 1) errors.push('sectionLayout may not duplicate frame or content slots without media');
    if (imageUrl === '' && media.length) errors.push('sectionLayout must omit the media slot when no photograph is supplied');
  }
  return { errors: [...new Set(errors)], signature: presentationSignature(parsed.root, () => [ATTRIBUTE]) };
}
