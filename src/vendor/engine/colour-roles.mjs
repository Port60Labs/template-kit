import { LIQUID_BUDGETS } from './budgets.mjs';

const ATTRIBUTE = 'data-p60-colour-role';
const ROLES = new Map([
  ['h2', 'text'], ['h3', 'text'], ['h4', 'text'],
  ['p', 'muted'], ['ul', 'muted'], ['ol', 'muted'], ['li', 'muted'],
  ['a', 'link'], ['blockquote', 'surface'], ['hr', 'border']
]);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const OPAQUE = new Set(['script', 'style', 'textarea', 'template', 'noscript', 'iframe', 'svg', 'math', 'astro-island']);

/** Adds paint ownership to already-sanitised rich text, never sanitises or marks it safe.
 * Opening tags retain their bytes apart from one inserted attribute. The bounded linear scan
 * avoids DOM allocation/serialization, preserving URLs, entities, whitespace and text-align.
 * Inline emphasis inherits its paragraph/heading/link; images and opaque subtrees are untouched.
 */
export function colourRoles(value) {
  if (typeof value !== 'string' || !value) return '';
  if (value.length > LIQUID_BUDGETS.parseLimit) throw new Error('colour_roles rich text exceeds the template parse budget');
  const chunks = [], opaque = [];
  let cursor = 0, copied = 0;
  while (cursor < value.length) {
    const start = value.indexOf('<', cursor);
    if (start < 0) break;
    if (value.startsWith('<!--', start)) {
      const end = value.indexOf('-->', start + 4);
      cursor = end < 0 ? value.length : end + 3;
      continue;
    }
    let end = start + 1, quote = null;
    for (; end < value.length; end++) {
      const character = value[end];
      if (quote) { if (character === quote) quote = null; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end === value.length) break;
    cursor = end + 1;
    const token = value.slice(start, cursor);
    const tag = /^<(\/)?([a-z][\w:-]*)(?=[\s/>])/i.exec(token);
    if (!tag) continue;
    const name = tag[2].toLowerCase();
    if (tag[1]) {
      if (opaque.at(-1) === name) opaque.pop();
      continue;
    }
    const attributes = [...token.slice(tag[0].length, -1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)];
    const names = attributes.map(attribute => attribute[1].toLowerCase());
    const closed = VOID.has(name) || /\/\s*>$/.test(token);
    if (opaque.length || OPAQUE.has(name) || names.includes('data-p60-island')) {
      if (!closed) opaque.push(name);
      continue;
    }
    const role = ROLES.get(name);
    if (!role) continue;
    const existing = attributes.filter(attribute => attribute[1].toLowerCase() === ATTRIBUTE);
    if (existing.length) {
      if (existing.length !== 1 || (existing[0][2] ?? existing[0][3] ?? existing[0][4]) !== role) {
        throw new Error('colour_roles cannot replace an existing conflicting colour role');
      }
      continue;
    }
    const insertion = start + tag[0].length;
    chunks.push(value.slice(copied, insertion), ` ${ATTRIBUTE}="${role}"`);
    copied = insertion;
  }
  return chunks.length ? chunks.join('') + value.slice(copied) : value;
}
