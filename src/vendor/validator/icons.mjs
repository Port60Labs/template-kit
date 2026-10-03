import * as lucide from 'lucide-static';

const table = lucide;
const cache = new Map();

/** "heart-handshake" / "heart_handshake" / "HeartHandshake" -> "HeartHandshake" (the lucide-static key). */
function pascal(name) {
  return name.trim().split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/** Resolve a Lucide icon name to its SVG string, or '' when blank or unknown. */
export function iconSvg(name) {
  if (!name || typeof name !== 'string') return '';
  const key = name.trim();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const svg = table[pascal(key)];
  const out = typeof svg === 'string' ? svg : '';
  cache.set(key, out);
  return out;
}

/** Add a resolved iconSvg to any items[] entries that carry an icon NAME; unchanged otherwise. */
export function withResolvedIcons(content) {
  if (!content || typeof content !== 'object' || !Array.isArray(content.items)) return content;
  const items = content.items.map((item) => {
    if (item && typeof item === 'object' && typeof item.icon === 'string' && item.icon) {
      return { ...item, iconSvg: iconSvg(item.icon) };
    }
    return item;
  });
  return { ...content, items };
}
