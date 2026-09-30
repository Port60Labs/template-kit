import { parsePresentationMarkup, presentationText, presentationVisible, presentationSignature } from './presentation-proof.mjs';

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

/** Structural proof of both presentations; author browser tests establish layout and usability. */
export async function proveNavigationModes(render, declaration, css = '') {
  const errors = [], signatures = new Map();
  const declared = declaration && Array.isArray(declaration.options) && declaration.options.length === 2
    && new Set(declaration.options).size === 2 && declaration.options.every(value => ['simple', 'mega'].includes(value))
    && declaration.options.includes(declaration.default);
  if (!declared) return errors;
  const flatten = items => items.flatMap(node => [node, ...flatten(node.children ?? [])]);
  const supplied = flatten(NAVIGATION_MODE_PROBES);
  for (const requested of [undefined, 'simple', 'mega', 'p60-unknown-mode']) {
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
        let lastIndex = -1;
        for (const item of supplied) {
          const index = nodes.findIndex(node => contains(node) && presentationVisible(node, { navigation: true })
            && (item.href ? node.tag === 'a' && node.attrs.href === item.href && presentationText(node).includes(item.label)
              : nonLink(node) && node.children.some(child => typeof child === 'string' && child.replace(/\s+/g, ' ').includes(item.label))));
          if (index < 0) errors.push(`${requested ?? 'default'}: both navigation modes must retain '${item.label}' and its supplied destination or non-link group label at every supported depth`);
          else if (index < lastIndex) errors.push(`${requested ?? 'default'}: both navigation modes must retain supplied navigation node order`);
          else lastIndex = index;
        }
      }
      signatures.set(requested ?? 'default', presentationSignature(root, () => [ATTRIBUTE]));
    } catch (error) { errors.push(`${requested ?? 'default'}: failed rendering navigation fixture, ${error.message}`); }
  }
  if (signatures.get('default') !== signatures.get(declaration.default) || signatures.get('p60-unknown-mode') !== signatures.get(declaration.default)) {
    errors.push('missing or unsupported preferences must use the declared default without altering navigation content');
  }
  const modeStyles = /\[data-p60-navigation-mode\s*=\s*["']?(?:simple|mega)["']?\s*\][^{]*\{[^}]*[a-z-]+\s*:\s*[^;}\s]+/i.test(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  if (signatures.get('simple') === signatures.get('mega') && !modeStyles) errors.push('simple and mega must implement distinct markup or explicit mode-scoped presentation, not only change a marker');
  return [...new Set(errors)].map(message => `layout navigationModes: ${message}`);
}
