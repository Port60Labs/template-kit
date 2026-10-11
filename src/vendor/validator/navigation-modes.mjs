import { parsePresentationMarkup, presentationText, presentationVisible, presentationSignature } from './presentation-proof.mjs';
import { NAVIGATION_MODES } from '../engine/presentation-capabilities.mjs';

const ATTRIBUTE = 'data-p60-navigation-mode';
export const NAVIGATION_MODE_PROBES = [
  { kind: 'link', label: 'P60 navigation parent', href: '/p60-nav-parent', children: [
    { kind: 'link', label: 'P60 navigation child', href: '/p60-nav-child', children: [
      { kind: 'link', label: 'P60 navigation grandchild', href: '/p60-nav-grandchild', children: [] }
    ] },
    { kind: 'group', label: 'P60 navigation child group', href: null, children: [
      { kind: 'link', label: 'P60 grouped grandchild', href: '/p60-nav-grouped-grandchild', children: [] }
    ] }
  ] },
  { kind: 'group', label: 'P60 navigation root group', href: null, children: [
    { kind: 'link', label: 'P60 root-group child', href: '/p60-nav-group-child', children: [] }
  ] },
  { kind: 'link', label: 'P60 final navigation link', href: '/p60-nav-last', children: [] }
];

function modeStyleSignature(css, mode) {
  const marker = new RegExp(`\\[${ATTRIBUTE}\\s*=\\s*["']?${mode}["']?\\s*\\]`, 'i');
  const anyMode = new RegExp(`\\[${ATTRIBUTE}\\s*=\\s*["']?(?:${NAVIGATION_MODES.join('|')})["']?\\s*\\]`, 'gi');
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector, declarations]) => marker.test(selector) && /[a-z-]+\s*:\s*[^;}\s]+/i.test(declarations))
    .map(([, selector, declarations]) => [selector.replace(anyMode, '[navigation-mode]').replace(/\s+/g, ' ').trim(), declarations.replace(/\s+/g, ' ').trim()]);
}

function owner(node) {
  for (let current = node; current; current = current.parent) if ('data-p60-nav-item' in current.attrs) return current;
  return null;
}

/** Structural proof of declared presentations; author browser tests establish layout and usability. */
export async function proveNavigationModes(render, declaration, css = '') {
  const errors = [], signatures = new Map();
  if (declaration === undefined) return errors;
  const declared = declaration && Array.isArray(declaration.options) && declaration.options.length >= 2
    && declaration.options.length <= NAVIGATION_MODES.length && new Set(declaration.options).size === declaration.options.length
    && [...declaration.options].every(value => NAVIGATION_MODES.includes(value))
    && declaration.options.includes(declaration.default);
  if (!declared) return ['layout navigationModes: declare 2 to 4 unique known modes and a default from those options'];
  const flatten = items => items.flatMap(node => [node, ...flatten(node.children ?? [])]);
  const supplied = flatten(NAVIGATION_MODE_PROBES);
  for (const requested of [undefined, ...NAVIGATION_MODES, 'p60-unknown-mode']) {
    const expected = declaration.options.includes(requested) ? requested : declaration.default;
    try {
      const { root, nodes } = parsePresentationMarkup(await render(requested, NAVIGATION_MODE_PROBES));
      const hooks = nodes.filter(node => Object.hasOwn(node.attrs, ATTRIBUTE));
      if (!hooks.length) errors.push(`${requested ?? 'default'}: must mark a real navigation root with ${ATTRIBUTE}`);
      for (const hook of hooks) {
        if (!(hook.tag === 'nav' || hook.attrs.role === 'navigation' || Object.hasOwn(hook.attrs, 'data-p60-nav'))
          || hook.attrs[ATTRIBUTE] !== expected || !presentationVisible(hook, { navigation: true })) {
          errors.push(`${requested ?? 'default'}: navigation root must render the resolved '${expected}' mode`);
        }
        const contains = node => { for (let parent = node.parent; parent; parent = parent.parent) if (parent === hook) return true; return false; };
        const nonLink = node => { for (let current = node; current && current !== hook; current = current.parent) if (current.tag === 'a') return false; return true; };
        const claimedOwners = new Set();
        let lastIndex = -1;
        for (const item of supplied) {
          const index = nodes.findIndex(node => contains(node) && presentationVisible(node, { navigation: true })
            && (item.href ? node.tag === 'a' && node.attrs.href === item.href && presentationText(node).includes(item.label)
              : nonLink(node) && node.children.some(child => typeof child === 'string' && child.replace(/\s+/g, ' ').includes(item.label))));
          if (index < 0) errors.push(`${requested ?? 'default'}: every declared navigation mode must retain '${item.label}' and its supplied destination or non-link group label at every supported depth`);
          else if (index < lastIndex) errors.push(`${requested ?? 'default'}: every declared navigation mode must retain supplied navigation node order`);
          else lastIndex = index;
          if (expected === 'cascading' && index >= 0 && item.children?.length) {
            const itemOwner = owner(nodes[index]);
            const ownHooks = itemOwner ? nodes.filter(node => owner(node) === itemOwner) : [];
            if (!itemOwner || claimedOwners.has(itemOwner) || !ownHooks.some(node => 'data-p60-nav-toggle' in node.attrs)
              || !ownHooks.some(node => 'data-p60-nav-menu' in node.attrs)) {
              errors.push(`cascading: '${item.label}' needs its own navigation item, toggle and submenu hooks`);
            }
            claimedOwners.add(itemOwner);
          }
        }
      }
      signatures.set(requested ?? 'default', presentationSignature(root, () => [ATTRIBUTE]));
    } catch (error) { errors.push(`${requested ?? 'default'}: failed rendering navigation fixture, ${error.message}`); }
  }
  if (signatures.has(declaration.default)
    && [undefined, ...NAVIGATION_MODES.filter(mode => !declaration.options.includes(mode)), 'p60-unknown-mode']
      .some(mode => signatures.has(mode ?? 'default') && signatures.get(mode ?? 'default') !== signatures.get(declaration.default))) {
    errors.push('missing or unsupported preferences must use the declared default without altering navigation content');
  }
  for (const [index, mode] of declaration.options.entries()) for (const other of declaration.options.slice(index + 1)) {
    if (signatures.has(mode) && signatures.has(other) && signatures.get(mode) === signatures.get(other)
      && JSON.stringify(modeStyleSignature(css, mode)) === JSON.stringify(modeStyleSignature(css, other))) {
      errors.push(`${mode} and ${other} must implement distinct markup or explicit mode-scoped presentation, not only change a marker`);
    }
  }
  return [...new Set(errors)].map(message => `layout navigationModes: ${message}`);
}
