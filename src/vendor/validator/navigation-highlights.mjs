// Structural render proof, not a CSS or accessibility audit. Menus may start closed and their
// responsive styling belongs to the author. Browser checks still establish visual usability.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const NON_CONTENT = new Set(['script', 'style', 'template', 'noscript']);
const CARDS = new Set(['aside', 'article', 'section', 'div', 'a']);

function parseMarkup(html) {
  const root = { tag: 'root', attrs: {}, children: [], parent: null, ownText: '' };
  const stack = [root];
  const nodes = [];
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g)) {
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    const close = /^<\/\s*([\w:-]+)/.exec(token);
    if (close) {
      const index = stack.findLastIndex((node) => node.tag === close[1].toLowerCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const open = /^<\s*([\w:-]+)/.exec(token);
    if (!open) {
      stack.at(-1).ownText += token;
      continue;
    }
    const attrs = {};
    for (const attribute of token.slice(open[0].length, -1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[attribute[1].toLowerCase()] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    }
    const node = { tag: open[1].toLowerCase(), attrs, children: [], parent: stack.at(-1), ownText: '' };
    node.parent.children.push(node);
    nodes.push(node);
    if (!VOID.has(node.tag) && !token.endsWith('/>')) stack.push(node);
  }
  return { root, nodes };
}

function isHidden(node) {
  if (NON_CONTENT.has(node.tag)) return true;
  // A closed navigation panel is expected. Hiding the card or its fields explicitly is not.
  if ('data-p60-nav-menu' in node.attrs || 'data-p60-nav' in node.attrs) return false;
  return 'hidden' in node.attrs || node.attrs['aria-hidden'] === 'true' ||
    /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$))/i.test(node.attrs.style ?? '');
}

function rendered(node) {
  for (let current = node; current; current = current.parent) if (isHidden(current)) return false;
  return true;
}

function textOf(node) {
  if (isHidden(node)) return '';
  return `${node.ownText} ${node.children.map(textOf).join(' ')}`;
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function inNavigation(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.tag === 'nav' || current.attrs.role === 'navigation') return true;
  }
  return false;
}

export function inspectNavigationHighlights(html, probes, { images = true } = {}) {
  const { nodes, root } = parseMarkup(html);
  const errors = [];
  for (const probe of probes) {
    const links = nodes.filter((node) => node.tag === 'a' && node.attrs.href === probe.promo.href && rendered(node));
    if (links.length !== 1 || !textOf(links[0]).includes(probe.promo.label)) {
      errors.push(`highlight '${probe.label}' must have exactly one visible link with the supplied href and label`);
      continue;
    }
    const card = nodes.find((node) => {
      if (!CARDS.has(node.tag) || !rendered(node) || !inNavigation(node)) return false;
      const text = textOf(node);
      const inside = [node, ...descendants(node)];
      return text.includes(probe.promo.title) && text.includes(probe.promo.text) &&
        !text.includes(probe.childLabel) && inside.includes(links[0]) &&
        (!images || inside.some((child) => child.tag === 'img' && child.attrs.src === probe.promo.imageUrl && rendered(child)));
    });
    if (!card) errors.push(`highlight '${probe.label}' must render its title, description, link and${images ? ' image' : ' optional image fallback'} together in a navigation card`);
    if (card) {
      let ownMenu = false;
      for (let parent = card.parent; parent; parent = parent.parent) {
        const text = textOf(parent);
        if (text.includes(probe.label) && text.includes(probe.childLabel) &&
            !probes.some((other) => other !== probe && text.includes(other.childLabel))) ownMenu = true;
      }
      if (!ownMenu) errors.push(`highlight '${probe.label}' must stay inside its own parent menu`);
    }
    if (!textOf(root).includes(probe.childLabel)) errors.push(`highlight '${probe.label}' must not replace the menu links`);
  }
  return errors;
}

export const NAVIGATION_HIGHLIGHT_PROBES = [1, 2].map((index) => ({
  label: `P60 highlight menu ${index}`,
  href: `/p60-highlight-menu-${index}`,
  childLabel: `P60 normal menu link ${index}`,
  promo: {
    title: `P60 highlight title ${index}`,
    text: `P60 highlight summary ${index}`,
    href: `/p60-highlight-destination-${index}`,
    label: `P60 highlight action ${index}`,
    imageUrl: `https://static.port60.com/p60-highlight-${index}.webp`
  }
}));

export async function proveNavigationHighlights(render, declared) {
  const errors = [];
  const warnings = [];
  const navFor = (mode) => ({
    items: NAVIGATION_HIGHLIGHT_PROBES.map((probe) => ({
      label: probe.label, href: probe.href,
      children: [{ label: probe.childLabel, href: `${probe.href}/child` }],
      ...(mode === 'absent' ? {} : { megaMenu: { promo: { ...probe.promo, ...(mode === 'image-free' ? { imageUrl: null } : {}) } } })
    })),
    footer: []
  });
  const populated = await render(navFor('populated'));
  const hasOutput = NAVIGATION_HIGHLIGHT_PROBES.some((probe) => Object.values(probe.promo).some((value) => populated.includes(value)));
  if (declared !== true) {
    if (hasOutput) {
      const message = 'layout: renders navigation highlight content but supports.navigationHighlights is not true';
      if (declared === false) errors.push(`${message}, declare support or omit the card`);
      else warnings.push(`${message}, older manifests remain valid but the editor will not offer highlights`);
    }
    return { errors, warnings };
  }
  errors.push(...inspectNavigationHighlights(populated, NAVIGATION_HIGHLIGHT_PROBES));
  const imageFree = await render(navFor('image-free'));
  errors.push(...inspectNavigationHighlights(imageFree, NAVIGATION_HIGHLIGHT_PROBES, { images: false }));
  const absent = await render(navFor('absent'));
  for (const probe of NAVIGATION_HIGHLIGHT_PROBES) {
    if (Object.values(probe.promo).some((sentinel) => absent.includes(sentinel))) {
      errors.push('highlight content appears when no highlight is supplied, branch on the optional promo object');
    }
    if (!textOf(parseMarkup(absent).root).includes(probe.childLabel)) {
      errors.push('normal menu links must remain available when no highlight is supplied');
    }
  }
  const empty = await render({ items: [], footer: [] });
  if (/<img\b[^>]*\bsrc\s*=\s*["']\s*(?:null|undefined)?\s*["']/i.test(imageFree + absent + empty)) {
    errors.push('missing highlights or images must not produce an empty image URL');
  }
  return { errors: errors.map((message) => `layout navigationHighlights: ${message}`), warnings };
}
