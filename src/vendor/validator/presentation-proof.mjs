const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
export function parsePresentationMarkup(html) {
  const root = { tag: 'root', attrs: {}, children: [], parent: null };
  const nodes = [], stack = [root];
  for (const [token] of html.matchAll(/<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g)) {
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    const close = /^<\/\s*([\w:-]+)/.exec(token);
    if (close) {
      const index = stack.findLastIndex(node => node.tag === close[1].toLowerCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const open = /^<\s*([\w:-]+)/.exec(token);
    if (!open) { stack.at(-1).children.push(token); continue; }
    const attrs = {};
    for (const attribute of token.slice(open[0].length, -1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const name = attribute[1].toLowerCase();
      if (!Object.hasOwn(attrs, name)) attrs[name] = decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    const node = { tag: open[1].toLowerCase(), attrs, children: [], parent: stack.at(-1) };
    node.parent.children.push(node);
    nodes.push(node);
    if (!VOID.has(node.tag) && !token.endsWith('/>')) stack.push(node);
  }
  return { root, nodes };
}
function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (!entity.startsWith('#')) return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[entity.toLowerCase()];
    const hex = entity[1].toLowerCase() === 'x';
    const value = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
  });
}
export function presentationText(node) {
  return node.children.map(child => typeof child === 'string' ? decode(child) : presentationText(child)).join(' ').replace(/\s+/g, ' ').trim();
}
export function presentationVisible(node, { navigation = false } = {}) {
  for (let current = node; current; current = current.parent) {
    if (['template', 'script', 'style', 'noscript', 'textarea', 'select'].includes(current.tag)) return false;
    if (navigation && current !== node && 'data-p60-nav-menu' in current.attrs) continue;
    if ('hidden' in current.attrs || current.attrs['aria-hidden'] === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$))/i.test(current.attrs.style ?? '')) return false;
  }
  return true;
}
export function presentationSignature(root, ignoredAttributes = () => []) {
  const visit = node => typeof node === 'string' ? node.replace(/\s+/g, ' ').trim() : [node.tag,
    Object.entries(node.attrs).filter(([key]) => !ignoredAttributes(node).includes(key)).sort(([a], [b]) => a.localeCompare(b)),
    node.children.map(visit).filter(value => value !== '')];
  return JSON.stringify(visit(root));
}
