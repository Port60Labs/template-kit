import { JSDOM } from 'jsdom';

// Split selector lists and var() arguments without splitting nested functions or strings.
function splitList(value) {
  const parts = []; let start = 0, depth = 0, quote = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\') { i++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(value.slice(start).trim()); return parts;
}

/** Resolve the actual authored body palette, including inherited tokens and nested fallbacks. */
export function designerPalette(document) {
  const page = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const doc = page.window.document;
  try {
    for (const [source, target] of [[document.documentElement, doc.documentElement], [document.body, doc.body]]) {
      for (const attr of source.attributes) target.setAttribute(attr.name, attr.value);
    }
    const rules = [];
    // Only unqualified page-level rules contribute to this desktop author palette.
    // Separate matching selectors: JSDOM otherwise incorrectly applies :root's specificity
    // to body in a selector list such as :root:root, body (Mosaic's shared defaults).
    for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) {
      if (rule.type !== 1 || !rule.style.cssText.includes('--')) continue;
      for (const selector of splitList(rule.selectorText)) {
        if (selector.includes('::')) continue;
        if (document.documentElement.matches(selector) || document.body.matches(selector)) rules.push(`${selector}{${rule.style.cssText}}`);
      }
    }
    const style = doc.createElement('style'); style.textContent = rules.join('\n'); doc.head.append(style);
    const computed = page.window.getComputedStyle(doc.body);
    function resolve(value, seen = new Set()) {
      const text = value.trim();
      if (!text.startsWith('var(') || !text.endsWith(')')) return text;
      const [key, ...fallback] = splitList(text.slice(4, -1));
      if (!/^--[\w-]+$/.test(key) || seen.has(key)) return '';
      const next = new Set(seen); next.add(key);
      return resolve(computed.getPropertyValue(key), next) || resolve(fallback.join(','), next);
    }
    const colours = [];
    for (const token of ['primary', 'bg', 'accent', 'gold', 'ink']) {
      let colour = resolve(computed.getPropertyValue(`--${token}`)).toLowerCase();
      if (/^#[\da-f]{3}$/.test(colour)) colour = `#${[...colour.slice(1)].map(c => c + c).join('')}`;
      // Do not invent a colour when an author value cannot be resolved.
      const probe = doc.createElement('span'); probe.style.color = colour;
      if (colour && !colour.includes('var(') && probe.style.color && !colours.some(existing => {
        const other = doc.createElement('span'); other.style.color = existing;
        return other.style.color === probe.style.color;
      })) colours.push(colour);
      if (colours.length === 3) break;
    }
    if (colours.length < 2) throw new Error('Designer palette needs at least two resolved authored colours');
    return colours;
  } finally { page.window.close(); }
}
