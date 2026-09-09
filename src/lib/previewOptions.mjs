// The dev preview's request-level options, kept pure so they are testable without a server: which
// surface a URL is, which knob values a query asks for (a Look, or single ?p60s-<key>= values),
// and which local file a /preview/ URL may serve.
import { existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/** Path → preview surface. Unknown paths are the home page, as production's fallback is. */
export function surfaceFor(rawUrl) {
  const url = new URL(rawUrl, 'http://preview.local');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/about') return 'about';
  if (path === '/events') return url.searchParams.has('event') ? 'event' : 'events';
  if (path === '/services') return url.searchParams.has('service') ? 'service' : 'services';
  if (path === '/donate') return 'donate';
  if (path === '/articles' || path === '/articles/all') return 'articles';
  if (path.startsWith('/articles/')) return 'article';
  if (path === '/campaigns') return 'campaigns';
  if (path.startsWith('/campaigns/')) return 'campaign';
  if (path === '/courses') return 'course';
  return 'home';
}

/**
 * Knob overrides from a query: `?look=<name>` applies one of the manifest's Looks (its values
 * bundle), then any `?p60s-<key>=<value>` wins for that knob. Unknown Looks and keys are ignored;
 * the renderer validates values against each knob's kind exactly as production does.
 */
export function knobOverridesFromQuery(manifest, searchParams) {
  const knobs = {};
  const lookName = searchParams.get('look');
  const look = lookName ? (manifest?.looks ?? []).find((l) => l.name === lookName) ?? null : null;
  if (look) Object.assign(knobs, look.values ?? {});
  const keys = new Set((manifest?.settings?.schema ?? []).map((k) => k.key));
  for (const [key, value] of searchParams) {
    if (key.startsWith('p60s-') && keys.has(key.slice('p60s-'.length))) knobs[key.slice('p60s-'.length)] = value;
  }
  return { knobs, look: look ? look.name : null };
}

/** Image types the preview folder may serve; everything else is refused. */
export const PREVIEW_ASSET_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
};

/**
 * `/preview/<file>` → the absolute path of a regular file inside `<dir>/preview/`, or null. The
 * folder is the author's own imagery beside the template (never packaged); only image types are
 * served, and a path that escapes the folder is refused.
 */
export function previewAssetPath(dir, pathname) {
  if (!pathname.startsWith('/preview/')) return null;
  const root = resolve(dir, 'preview');
  let rel;
  try {
    rel = decodeURIComponent(pathname.slice('/preview/'.length));
  } catch {
    return null;
  }
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase();
  if (!PREVIEW_ASSET_TYPES[ext]) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return abs;
}

export function previewAssetType(abs) {
  return PREVIEW_ASSET_TYPES[abs.slice(abs.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';
}
