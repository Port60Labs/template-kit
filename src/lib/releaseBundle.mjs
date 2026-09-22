import { readFileSync, existsSync, realpathSync, lstatSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { loadArtifactDir } from './artifactFiles.mjs';
import { designerPalette } from './designerPalette.mjs';
import { validateNewArtifact } from '../vendor/validator/validate.mjs';
import { renderStudioPreview } from '../vendor/validator/preview-v2.mjs';
import { composePage, validatePreviewContent } from '../vendor/validator/site-context-v2.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const artifactDigest = files => digest(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
const MAX_MEDIA = 2 * 1024 * 1024;
const MAX_BUNDLE = 24 * 1024 * 1024;
const MAX_HTML = 2 * 1024 * 1024;
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(jpg|jpeg|png|webp)$/;

function ownedFile(root, path) {
  const candidate = resolve(root, path);
  const rel = relative(root, candidate);
  if (!rel || rel.startsWith('..') || rel.includes('\\')) throw new Error(`Preview path outside template: ${path}`);
  let part = root;
  for (const segment of rel.split('/')) {
    part = join(part, segment);
    if (lstatSync(part).isSymbolicLink()) throw new Error(`Linked preview input refused: ${path}`);
  }
  if (!lstatSync(candidate).isFile()) throw new Error(`Preview input is not a file: ${path}`);
  return candidate;
}

function imageType(bytes, filename) {
  if (/\.jpe?g$/i.test(filename) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/\.png$/i.test(filename) && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (/\.webp$/i.test(filename) && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new Error(`Unsupported or mislabelled preview image: ${filename}`);
}

/** Builds two isolated file sets. Runtime sources are never expanded with demo media. */
export async function buildReleaseBundle(directory) {
  const root = realpathSync(directory);
  const runtime = loadArtifactDir(root);
  const { errors, manifest } = await validateNewArtifact(runtime);
  if (errors.length) throw new Error(errors.join('\n'));
  if (!/^[a-z][a-z0-9-]{1,48}[a-z0-9]$/.test(manifest.name) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Store releases require a safe name and a stable version');
  const config = JSON.parse(readFileSync(ownedFile(root, 'preview/config.json'), 'utf8'));
  if (config.schemaVersion !== 1 || Object.keys(config).some(key => !['schemaVersion', 'content', 'focus'].includes(key))) throw new Error('Unsupported preview/config.json');
  if (!['none', 'donate', 'volunteer'].includes(config.focus ?? 'none')) throw new Error('Unknown preview focus');
  const content = config.content ? JSON.parse(readFileSync(ownedFile(root, `preview/${config.content}`), 'utf8')) : { pages: { home: composePage(manifest, 'home') } };
  const problems = validatePreviewContent(content);
  if (problems.length) throw new Error(problems.join('\n'));
  const files = {};
  const add = (path, content, contentType) => {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    files[path] = { bytes, contentType, sha256: digest(bytes) };
  };
  for (const [path, text] of Object.entries(runtime)) add(`template/${path}`, text, path.endsWith('.json') ? 'application/json' : path.endsWith('.css') ? 'text/css' : 'text/plain; charset=utf-8');
  const images = new Map();
  function localImage(value) {
    if (typeof value !== 'string' || !value.startsWith('p60preview:')) return value;
    const name = value.slice('p60preview:'.length);
    if (!SAFE_NAME.test(name)) throw new Error(`Unsafe preview image: ${name}`);
    if (images.has(value)) return images.get(value);
    const bytes = readFileSync(ownedFile(root, `preview/media/${name}`));
    if (bytes.length > MAX_MEDIA) throw new Error(`Preview image exceeds 2 MiB: ${name}`);
    const type = imageType(bytes, name);
    const path = `media/${digest(bytes).slice(0, 16)}-${name}`;
    add(`preview/${path}`, bytes, type);
    images.set(value, `../${path}`);
    return `../${path}`;
  }
  function mapContent(value, key = '') {
    if (Array.isArray(value)) return value.map(item => mapContent(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapContent(v, k)]));
    if (/^(imageUrl|logoUrl|footerLogoUrl)$/.test(key) && typeof value === 'string' && value && !value.startsWith('p60fixture:')) {
      if (!value.startsWith('p60preview:')) throw new Error(`Use p60preview:filename for author imagery, not ${value.slice(0, 80)}`);
      return localImage(value);
    }
    return value;
  }
  const authorContent = mapContent(content);
  const artifactHash = artifactDigest(runtime);
  const demo = { format: 'port60-designer-preview@1', name: manifest.name, version: manifest.version, label: manifest.label, artifactHash, looks: [] };
  const bridge = readFileSync(new URL('./designer-bridge.js', import.meta.url), 'utf8');
  const bridgeHash = createHash('sha256').update(bridge).digest('base64');
  const looks = manifest.looks?.length ? manifest.looks : [{ name: 'Default', values: {} }];
  if (looks.length > 24) throw new Error('At most 24 preview Looks per release');
  for (const [index, look] of looks.entries()) {
    const html = await renderStudioPreview(runtime, { surface: 'home', previewContent: authorContent, knobs: { ...look.values, motion: 'Minimal' }, look: look.name, focus: config.focus ?? 'none', webfonts: true, localImages: true });
    const dom = new JSDOM(html);
    try {
      const doc = dom.window.document;
      doc.documentElement.classList.add('p60-js');
      doc.querySelectorAll('[data-p60-carousel]').forEach(carousel => {
        [...carousel.querySelectorAll('[data-p60-slide]')].filter(slide => slide.closest('[data-p60-carousel]') === carousel).forEach((slide, i) => slide.classList.toggle('is-active', i === 0));
      });
      doc.querySelectorAll('script, iframe, object, embed, base, .p60-preview-surfaces, .p60-preview-badge, .p60-preview-divider').forEach(node => node.remove());
      doc.querySelectorAll('*').forEach(node => {
        for (const attr of [...node.attributes]) if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      });
      doc.querySelectorAll('a').forEach(link => { link.removeAttribute('href'); link.removeAttribute('target'); link.setAttribute('aria-disabled', 'true'); });
      doc.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = true; });
      doc.querySelectorAll('form').forEach(form => { form.removeAttribute('action'); form.removeAttribute('method'); });
      doc.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') ?? '';
        if (!src.startsWith('data:') && ![...images.values()].includes(src)) img.remove();
        img.removeAttribute('srcset');
      });
      doc.querySelectorAll('link').forEach(link => {
        if (link.getAttribute('rel') !== 'stylesheet' || !/^https:\/\/fonts\.bunny\.net\/css2?\?/.test(link.getAttribute('href') ?? '')) link.remove();
      });
      const style = doc.createElement('style');
      style.textContent = `html{scroll-behavior:auto}.menu-panel,[data-p60-nav-menu]{display:none!important}[data-p60-reveal]{opacity:1!important;transform:none!important}*,*::before,*::after{animation:none!important;transition:none!important}.p60-preview-slide:not(:first-child){display:none}a[aria-disabled]{cursor:default}`;
      doc.head.append(style);
      const script = doc.createElement('script'); script.textContent = bridge; doc.body.append(script);
      doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content = `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' https://fonts.bunny.net; font-src https://fonts.bunny.net; script-src 'sha256-${bridgeHash}'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'`;
      const output = dom.serialize();
      if (Buffer.byteLength(output) > MAX_HTML) throw new Error('Preview page exceeds 2 MiB');
      const path = `looks/${index}-${digest(output).slice(0, 12)}.html`;
      add(`preview/${path}`, output, 'text/html; charset=utf-8');
      demo.looks.push({ name: look.name, path, values: look.values, colours: designerPalette(doc) });
    } finally { dom.window.close(); }
  }
  add('preview/manifest.json', JSON.stringify(demo, null, 2) + '\n', 'application/json');
  const inventory = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, file]) => ({ path, size: file.bytes.length, sha256: file.sha256, contentType: file.contentType }));
  if (inventory.reduce((sum, file) => sum + file.size, 0) > MAX_BUNDLE) throw new Error('Release exceeds 24 MiB');
  const release = { format: 'port60-template-release@1', name: manifest.name, version: manifest.version, artifactHash, files: inventory };
  add('release.json', JSON.stringify(release, null, 2) + '\n', 'application/json');
  return { manifest, demo, release, files };
}
