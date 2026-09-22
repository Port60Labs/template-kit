import { chromium } from 'playwright';

export const POSTER_WIDTH = 960;
export const POSTER_HEIGHT = 600;
export const MAX_POSTER_BYTES = 160 * 1024;
const ORIGIN = 'https://p60-preview.invalid';
const VIEWPORT = { width: 1440, height: 900 };
const fontCache = new Map();

// Gallery posters are a Latin-script design impression. Arabic font fidelity is deferred
// by product choice. Remove only the platform-only faces from the capture copy, never the
// published HTML, platform CSS or runtime template. This prevents broken /fonts requests.
export function galleryCaptureHtml(html) {
  return html.replace(/@font-face\s*\{[^{}]*font-family:\s*'(?:KFGQPC HAFS Uthmanic Script|KFGQPC Nastaleeq|IBM Plex Sans Arabic)'[^{}]*\}/g, '');
}

/** Only sealed bundle assets and the preview's existing font host may be requested. */
export function posterResource(url, files) {
  const parsed = new URL(url);
  if (parsed.username || parsed.password || parsed.hash) return null;
  if (parsed.origin === ORIGIN && !parsed.search) {
    const path = parsed.pathname.slice(1);
    if (path.startsWith('preview/') && Object.hasOwn(files, path)) return { file: files[path] };
  }
  if (parsed.origin === 'https://fonts.bunny.net' && (
    /^\/css2?$/.test(parsed.pathname) || /^\/[a-zA-Z0-9_./-]+\.woff2?$/.test(parsed.pathname)
  )) return { font: parsed.href };
  return null;
}

/** One browser per release; one isolated, script-disabled context per Look. */
export async function createPosterRenderer(files) {
  let browser;
  try { browser = await chromium.launch({ headless: true, chromiumSandbox: true }); }
  catch (cause) {
    throw new Error('Gallery rendering needs the kit browser. Run p60-template-kit setup-previews (CI: add --with-deps).', { cause });
  }
  return {
    close: () => browser.close(),
    async render(path) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1,
        colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'UTC',
        javaScriptEnabled: false, serviceWorkers: 'block' });
      const failures = new Set();
      const deadline = setTimeout(() => { void context.close(); }, 45000);
      try {
        await context.route('**/*', async route => {
          const resource = posterResource(route.request().url(), files);
          try {
            if (resource?.file) {
              const body = resource.file.contentType.startsWith('text/html')
                ? galleryCaptureHtml(resource.file.bytes.toString()) : resource.file.bytes;
              await route.fulfill({ status: 200, contentType: resource.file.contentType, body });
            } else if (resource?.font) {
              let font = fontCache.get(resource.font);
              if (!font) {
                const response = await route.fetch({ timeout: 15000, maxRedirects: 0 });
                try {
                  const body = await response.body();
                  if (!response.ok() || body.length > 2 * 1024 * 1024) throw new Error('Font unavailable or too large');
                  font = { body, contentType: response.headers()['content-type'] };
                  if (fontCache.size >= 128) fontCache.delete(fontCache.keys().next().value);
                  fontCache.set(resource.font, font);
                } finally { await response.dispose(); }
              }
              await route.fulfill({ status: 200, ...font, headers: { 'access-control-allow-origin': '*' } });
            } else {
              failures.add('A preview requested an asset outside the sealed bundle/font host');
              await route.abort('blockedbyclient');
            }
          } catch {
            failures.add(`Could not load preview asset: ${route.request().url()}`);
            await route.abort('failed').catch(() => {});
          }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.on('requestfailed', request => failures.add(`Could not load preview asset: ${request.url()}`));
        await page.goto(`${ORIGIN}/preview/${path}`, { waitUntil: 'load', timeout: 30000 });
        await page.evaluate(async () => {
          await document.fonts.ready;
          const visible = [...document.images].filter(image => {
            const bounds = image.getBoundingClientRect();
            return bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
          });
          await Promise.all(visible.map(image => image.decode()));
          const errors = [...document.fonts].filter(font => font.status === 'error').map(font => font.family);
          if (errors.length) throw new Error(`Preview font failed: ${errors.join(', ')}`);
        });
        if (failures.size) throw new Error([...failures].join('; '));
        const session = await context.newCDPSession(page);
        for (const quality of [82, 70, 58]) {
          // Chromium encodes WebP directly: no separate image library or full-page screenshot.
          const { data } = await session.send('Page.captureScreenshot', { format: 'webp', quality,
            captureBeyondViewport: false, clip: { x: 0, y: 0, ...VIEWPORT, scale: POSTER_WIDTH / VIEWPORT.width } });
          const bytes = Buffer.from(data, 'base64');
          if (bytes.length <= MAX_POSTER_BYTES) return bytes;
        }
        throw new Error('Gallery poster exceeds 160 KiB; simplify the above-the-fold designer imagery');
      } catch (cause) {
        throw new Error(`Could not render gallery poster for ${path}: ${cause.message}; ${[...failures].join('; ')}`, { cause });
      } finally { clearTimeout(deadline); await context.close(); }
    }
  };
}
