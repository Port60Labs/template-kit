import { HEADING_ALIGNMENTS } from '../engine/section-heading-alignment.mjs';

const ATTRIBUTE = 'data-p60-heading-align';
const VALUES = HEADING_ALIGNMENTS;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const NON_CONTENT = new Set(['script', 'style', 'template', 'noscript', 'textarea', 'xmp', 'plaintext', 'title', 'select']);
const NON_HEADING = new Set(['img', 'picture', 'svg', 'video', 'audio', 'canvas', 'iframe', 'ul', 'ol', 'li', 'dl', 'table', 'form', 'button', 'input', 'article', 'aside']);
const GROUPS = new Set(['div', 'header', 'hgroup', 'section']);
const isHeading = node => /^h[1-6]$/.test(node.tag);

function markup(html) {
  const root = { tag: 'root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const nodes = [];
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
      if (!Object.hasOwn(attrs, name)) attrs[name] = decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    const node = { tag: open[1].toLowerCase(), attrs, children: [], parent: stack.at(-1) };
    node.parent.children.push(node);
    nodes.push(node);
    if (!VOID.has(node.tag) && !token.endsWith('/>')) stack.push(node);
  }
  return nodes;
}

function hidden(node) {
  return NON_CONTENT.has(node.tag) || 'hidden' in node.attrs || node.attrs['aria-hidden'] === 'true' ||
    /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$))/i.test(node.attrs.style ?? '');
}

function visible(node) {
  for (let current = node; current; current = current.parent) if (hidden(current)) return false;
  return true;
}

function decodeEntities(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity.startsWith('#')) {
      const value = Number.parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
    }
    return entities[entity.toLowerCase()];
  });
}

function normalise(text) {
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

function textOf(node) {
  if (hidden(node)) return '';
  return node.children.map(child => {
    if (typeof child === 'string') return child;
    if (child.tag === 'br') return ' ';
    const text = textOf(child);
    return isHeading(child) || GROUPS.has(child.tag) || child.tag === 'p' ? ` ${text} ` : text;
  }).join('');
}

function inside(node) {
  return [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : inside(child))];
}

/** Every hook must target the section introduction, not cards, media, or the whole section. */
export function inspectHeadingAlignment(html, requested, { heading = '', eyebrow = '', requireHook = false } = {}) {
  const hooks = markup(html).filter(node => Object.hasOwn(node.attrs, ATTRIBUTE));
  const errors = [];
  if (requested === undefined) {
    if (hooks.some(node => VALUES.includes(node.attrs[ATTRIBUTE]))) {
      errors.push('default/unsupported alignment must not emit an active data-p60-heading-align override');
    }
    if (!requireHook) return errors;
  }
  const label = requested ?? 'default';
  const matches = value => requested === undefined ? !VALUES.includes(value) : value === requested;
  const headingText = normalise(heading);
  const eyebrowText = normalise(eyebrow);
  let alignedHeading = false;
  if (!hooks.length) errors.push(`'${label}' must render a permanent data-p60-heading-align hook on the section heading, including an inactive hook at the template default`);
  for (const hook of hooks) {
    if (!matches(hook.attrs[ATTRIBUTE])) errors.push(`every heading hook must render the requested '${label}' value (found '${hook.attrs[ATTRIBUTE]}')`);
    const descendants = inside(hook);
    const text = normalise(textOf(hook));
    const headings = descendants.filter(node => isHeading(node) && visible(node));
    const containsHeading = headings.length === 1 && headingText !== '' && normalise(textOf(headings[0])) === headingText;
    const isEyebrow = !headings.length && eyebrowText !== '' && text === eyebrowText && ['p', 'span', 'div', 'strong', 'small'].includes(hook.tag);
    const onlyHeadingCopy = [headingText, `${eyebrowText} ${headingText}`, `${headingText} ${eyebrowText}`].map(normalise).includes(text);
    const headingGroup = containsHeading && (isHeading(hook) || GROUPS.has(hook.tag)) && onlyHeadingCopy;
    if (!visible(hook) || descendants.some(node => NON_HEADING.has(node.tag)) || (!headingGroup && !isEyebrow)) {
      errors.push(`'${label}' hook must mark the real section heading, its eyebrow, or a heading-only group; not hidden/empty markup, body copy, media or cards`);
    } else if (headingGroup && matches(hook.attrs[ATTRIBUTE])) alignedHeading = true;
  }
  if (!alignedHeading) errors.push(`'${label}' must mark a visible nonempty section heading (h1 to h6), not only its eyebrow or unrelated card headings`);
  return [...new Set(errors)];
}

/** Canonical sample data, with optional introduction copy populated so every claim is exercised. */
export function headingAlignmentFixture(entry) {
  const content = structuredClone(entry.sample ?? {});
  delete content.headingAlignment;
  const headingField = entry.fields.find(field => field.name === 'title' || field.name === 'heading')?.name;
  if (headingField && !content[headingField]) content[headingField] = `P60 ${entry.type} section heading`;
  if (entry.fields.some(field => field.name === 'eyebrow') && !content.eyebrow) content.eyebrow = `P60 ${entry.type} eyebrow`;
  return { content, heading: content[headingField] ?? '', eyebrow: content.eyebrow ?? '' };
}

/** render receives raw content; the caller uses the same manifest-aware resolver as preview. */
export async function proveHeadingAlignment(render, entry, declared, { inheritedHeading } = {}) {
  const values = Array.isArray(declared) ? declared.filter(value => VALUES.includes(value)) : [];
  const fixture = headingAlignmentFixture(entry);
  const fixtures = [{ ...fixture, name: 'authored' }];
  if (typeof inheritedHeading === 'string' && inheritedHeading !== '') {
    const content = { ...fixture.content };
    delete content.title;
    fixtures.push({ content, heading: inheritedHeading, eyebrow: fixture.eyebrow, name: 'inherited' });
  }
  const errors = [];
  for (const fixture of fixtures) {
    for (const requested of [undefined, ...VALUES, 'p60-unknown-alignment']) {
      const content = { ...fixture.content, ...(requested === undefined ? {} : { headingAlignment: requested }) };
      const expected = values.includes(requested) ? requested : undefined;
      const label = `${fixture.name} ${requested ?? 'default'}`;
      try {
        const html = await render(content);
        errors.push(...inspectHeadingAlignment(html, expected, { ...fixture, requireHook: values.length > 0 }).map(message => `${label}: ${message}`));
      } catch (error) {
        errors.push(`${label}: failed rendering headingAlignment fixture, ${error.message}`);
      }
    }
  }
  return errors.map(message => `section '${entry.type}' headingAlignment: ${message}`);
}
