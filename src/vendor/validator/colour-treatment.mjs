import { SECTION_PRESENTATION_CONTROLS, SECTION_ROOT_TAGS } from '../engine/section-presentation.mjs';
import { parsePresentationMarkup, presentationSignature, presentationVisible, presentationText } from './presentation-proof.mjs';

const ATTRIBUTE = SECTION_PRESENTATION_CONTROLS.colourTreatment.attribute;
const ROLE = 'data-p60-colour-role';
const ROLES = ['text', 'muted', 'accent', 'surface', 'border', 'link', 'button', 'secondary-button'];
const ACTIONS = new Set(['link', 'button', 'secondary-button']);
const PROPERTIES = new Set(['color', 'background-color', 'border-color', 'outline-color', 'text-decoration-color']);
const ROOT = '(?:[a-z][\\w-]*)?(?:\\.[\\w-]+)*';
const TOKEN = '\\[data-p60-colour-treatment\\s*=\\s*(?:"(standard|soft|contrast)"|\'(standard|soft|contrast)\'|(standard|soft|contrast))\\s*\\]';
const OWNED = '\\[data-p60-colour-role\\s*=\\s*(?:"([\\w-]+)"|\'([\\w-]+)\'|([\\w-]+))\\s*\\]';
const SELECTOR = new RegExp(`^${ROOT}${TOKEN}(?:\\s+${OWNED}(?::(hover|focus-visible|active))?)?$`);
const cssIdentifier = value => value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, character) =>
  hex ? String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)) : character);
const mentionsTreatment = value => cssIdentifier(value).toLowerCase().includes(ATTRIBUTE);

function hasNestedTreatmentRule(css) {
  const scopes = [];
  let start = 0, quote = null;
  for (let index = 0; index < css.length; index++) {
    const character = css[index];
    if (character === '\\') { index++; continue; }
    if (quote) { if (character === quote) quote = null; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '{') {
      if (scopes.some(Boolean)) return true;
      scopes.push(mentionsTreatment(css.slice(start, index)));
      start = index + 1;
    } else if (character === '}') {
      scopes.pop();
      start = index + 1;
    }
  }
  return false;
}

/** Deliberately small paint-only grammar. Authored palette values never become stored CSS. */
export function colourTreatmentRules(css) {
  const rules = [], errors = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (hasNestedTreatmentRule(clean)) errors.push('colourTreatment rules must use explicit flat scoped selectors; nested rules and nested at-rules are not supported');
  for (const [, selectors, body] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // HTML attribute names match case-insensitively. Decode only for discovery so alternative
    // casing/escapes cannot hide unsafe declarations; the canonical author grammar still rejects them.
    if (!mentionsTreatment(selectors)) continue;
    const declarations = new Map();
    for (const part of body.split(';').map(value => value.trim()).filter(Boolean)) {
      const match = /^([a-z-]+)\s*:\s*(.+)$/i.exec(part);
      if (match && cssIdentifier(match[2]).includes('!')) {
        errors.push('colourTreatment paint must not use !important or other priority overrides; retain the authored cascade');
        continue;
      }
      if (!match || !PROPERTIES.has(match[1].toLowerCase())
        || /(?:url|image-set|attr|expression)\s*\(|[{}@]/i.test(match[2])) {
        errors.push('colourTreatment CSS may change only colour, background-colour, border-colour, outline-colour and text-decoration-colour; no palette rebinding, images, layout, opacity or filters');
        continue;
      }
      declarations.set(match[1].toLowerCase(), match[2].trim());
    }
    if (!declarations.size) errors.push('colourTreatment needs effective paint declarations, not only a changing marker');
    for (const selector of selectors.split(',')) {
      const matched = SELECTOR.exec(selector.trim());
      const token = matched?.[1] ?? matched?.[2] ?? matched?.[3];
      const role = matched?.[4] ?? matched?.[5] ?? matched?.[6] ?? null;
      if (!matched || role !== null && !ROLES.includes(role)) {
        errors.push('colourTreatment CSS must target its exact natural root token or a documented marked colour role inside that root, with optional hover/focus-visible/active');
        continue;
      }
      rules.push({ token, role, state: matched[7] ?? null, root: selector.trim().split('[')[0], declarations });
    }
  }
  return { rules, errors };
}

function coverage(rules, token, role, state = null) {
  return new Map(rules.filter(rule => rule.token === token && rule.role === role && rule.state === state)
    .flatMap(rule => [...rule.declarations]));
}

function paintErrors(rules, declaration) {
  const errors = [];
  const options = declaration?.options ?? [];
  const signatures = new Set();
  for (const rule of rules) {
    if (rule.token === declaration?.default) errors.push('colourTreatment default must keep inherited CSS exactly; do not author a token override for the default');
  }
  for (const token of options.filter(option => option !== declaration.default)) {
    const paint = coverage(rules, token, null);
    if (!paint.has('background-color') || !paint.has('color') || /^(?:transparent|inherit|initial|unset)$/i.test(paint.get('background-color') ?? '')) {
      errors.push(`colourTreatment '${token}' must coordinate an authored root background-color and color`);
    }
    const signature = JSON.stringify(rules.filter(rule => rule.token === token).map(rule =>
      [rule.role, rule.state, [...rule.declarations].sort(([a], [b]) => a.localeCompare(b))]).sort());
    if (signatures.has(signature)) errors.push('colourTreatment options must not repeat identical paint rules');
    signatures.add(signature);
  }
  return [...new Set(errors)];
}

export function colourTreatmentCssErrors(css, declaration) {
  const { rules, errors } = colourTreatmentRules(css);
  if (declaration?.options?.length && !rules.length) errors.push('colourTreatment needs authored coordinated paint rules');
  // A stylesheet covers several sections with independent choices/defaults. The render proof
  // below scopes semantic coverage to the actual root instead of borrowing another section's CSS.
  return [...new Set(errors)];
}

function matchesRoot(node, selector) {
  const tag = /^[a-z][\w-]*/i.exec(selector)?.[0];
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
  return (!tag || node.tag === tag.toLowerCase()) && classes.every(name => (node.attrs.class ?? '').split(/\s+/).includes(name));
}

/** Marked roles identify authored content, not arbitrary selectors into a platform island. */
export function inspectColourTreatment(html, expected, required, css, declaration) {
  const parsed = parsePresentationMarkup(html);
  const roots = parsed.root.children.filter(node => typeof node !== 'string');
  const hooks = parsed.nodes.filter(node => Object.hasOwn(node.attrs, ATTRIBUTE));
  const roles = parsed.nodes.filter(node => Object.hasOwn(node.attrs, ROLE));
  const errors = [];
  const entirelyEmpty = !roots.length && !presentationText(parsed.root);
  if (required && !entirelyEmpty && hooks.length !== 1) errors.push('one permanent data-p60-colour-treatment hook is required on the natural outer section root');
  for (const hook of hooks) {
    if (roots.length !== 1 || hook !== roots[0] || !SECTION_ROOT_TAGS.includes(hook.tag) || !presentationVisible(hook)
      || parsed.root.children.some(node => typeof node === 'string' && node.trim())) errors.push('colourTreatment must target the single visible natural outer section root');
    if (hook.attrs[ATTRIBUTE] !== (expected ?? '')) errors.push('colourTreatment must render its exact accepted token or an empty inherited hook');
  }
  if (required && (parsed.nodes.some(node => node.tag === 'astro-island' || Object.hasOwn(node.attrs, 'data-p60-island'))
    || /\u0000P60_ISLAND:/.test(html))) errors.push('colourTreatment does not support sections containing platform islands; keep their palette and state untouched');
  const rules = colourTreatmentRules(css).rules.filter(rule => hooks.length === 1 && matchesRoot(hooks[0], rule.root));
  if (required && !entirelyEmpty) errors.push(...paintErrors(rules, declaration));
  for (const node of roles) {
    const role = node.attrs[ROLE];
    if (!ROLES.includes(role) || hooks.length !== 1 || node === hooks[0] || ['img', 'picture', 'source', 'video', 'canvas', 'astro-island'].includes(node.tag)) {
      errors.push('data-p60-colour-role must mark an owned content descendant with a documented role, never an image or island');
      continue;
    }
    if (ACTIONS.has(role) && !['a', 'button', 'summary'].includes(node.tag)) errors.push(`colourTreatment '${role}' must mark an actual link or button`);
    if (!expected || expected === declaration?.default || !required) continue;
    const paint = coverage(rules, expected, role);
    const properties = role === 'surface' || role === 'button' || role === 'secondary-button'
      ? ['background-color', 'color'] : role === 'border' ? ['border-color'] : ['color'];
    if (properties.some(property => !paint.has(property))) errors.push(`colourTreatment '${expected}' must coordinate the rendered '${role}' role (${properties.join(', ')})`);
    if (ACTIONS.has(role)) for (const state of ['hover', 'focus-visible']) {
      if (!coverage(rules, expected, role, state).size) errors.push(`colourTreatment '${expected}' needs an authored ${state} treatment for '${role}'`);
    }
  }
  if (required && presentationText(parsed.root) && !roles.some(node =>
    ['text', 'muted', 'accent', 'link', 'button', 'secondary-button'].includes(node.attrs[ROLE])
      && presentationVisible(node) && presentationText(node))) {
    errors.push('colourTreatment needs a marked visible copy role, not a background-only control');
  }
  return { errors: [...new Set(errors)], signature: presentationSignature(parsed.root, () => [ATTRIBUTE]) };
}
