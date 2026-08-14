import { createServer } from 'node:http';
import { watch, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderStudioPreview } from '../vendor/validator/preview.mjs';
import { validateArtifact } from '../vendor/validator/validate.mjs';
import { applyPreviewContent, buildSiteFixture, validatePreviewContent } from '../vendor/validator/site-context.mjs';
import { renderModelReferenceHtml } from '../vendor/validator/model-reference.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';
import { join } from 'node:path';

/**
 * The author's optional preview data (content model v1): preview-content.json beside the
 * manifest replaces site.content collections wholesale for THIS preview, data is free, shape is
 * fixed (schema-validated every read; problems land in the terminal and the canonical fixtures
 * render instead). Hot like everything else: re-read on every request, never packaged, refused
 * by the upload intake.
 */
function loadPreviewContent(dir, explicitPath) {
  const path = explicitPath ?? join(dir, 'preview-content.json');
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    if (explicitPath) console.error(`✗ --content file not found: ${explicitPath}, using the canonical fixtures`);
    return null; // no file, the canonical fixtures render
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error(`✗ preview-content.json is not valid JSON (${e.message}), using the canonical fixtures`);
    return null;
  }
  const problems = validatePreviewContent(json);
  if (problems.length > 0) {
    console.error('✗ preview-content.json ignored, the shape is fixed even though the data is yours:');
    for (const problem of problems) console.error(`  - ${problem}`);
    return null;
  }
  return json;
}

/** The origins of every absolute URL in the override, the hosts the dev CSP must admit. */
function imageOriginsOf(json) {
  const origins = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        // Imagery fields only (imageUrl, logoUrl, …), a directions link is a URL too, and the
        // CSP should admit exactly the hosts that will be ASKED for pixels.
        if (/Url$/.test(key) && typeof inner === 'string' && /^https?:\/\//.test(inner)) {
          try {
            origins.add(new URL(inner).origin);
          } catch {
            // not a URL after all, nothing to admit
          }
        } else {
          walk(inner);
        }
      }
    }
  };
  walk(json);
  return [...origins];
}

/**
 * `dev <dir> [--port 4400]`, the local preview: your template over the contract's kind fixtures,
 * the SAME render the studio and reviewers see (islands as fixture-hydrated skeletons,
 * network-dead CSP). ONE addition over the studio render: the platform's own behaviour runtime is
 * inlined, so data-p60-* carousels, reveals and tabs run for real locally, the only script the
 * document can execute. Files are re-read on every request, so a browser refresh is the hot
 * reload; file changes also re-run validation into the terminal, the human watches the page,
 * the agent watches the JSON.
 */
export async function dev(args) {
  const dir = resolve(args._[0] ?? '.');
  const port = Number(args.port ?? 4400);
  // The dev-richer half of the imagery split: point P60_FIXTURE_IMAGES at the platform's fixture
  // imagery base and the preview loads photographic fixtures from that ONE origin instead of the
  // sealed inline-SVG art. Unset (the default), the preview stays fully network-dead.
  const fixtureImageBase = process.env.P60_FIXTURE_IMAGES || null;
  // `--content my-org.json` points the preview at YOUR data (an ejected, edited copy of the
  // content model, see the `content` command). Without it, preview-content.json beside the
  // manifest is picked up by convention. Hot either way: re-read on every request.
  // Relative --content paths resolve against the TEMPLATE dir (matching the eject hint);
  // absolute paths pass through untouched.
  const contentPath = typeof args.content === 'string' ? resolve(dir, args.content) : null;
  let behaviorsRuntime = null;
  try {
    behaviorsRuntime = readFileSync(
      resolve(import.meta.dirname, '../vendor/validator/behaviors-runtime.js'), 'utf8');
  } catch {
    // An older vendored copy without the runtime, the preview degrades to the CSS approximation.
  }

  // The preview is ROUTED: nav links land on real surfaces, so an author sees every platform
  // page wearing their chrome, their own page template where they ship one, the platform's
  // fixture skeleton where the page is platform-owned (ticket purchase, donate, campaigns).
  const surfaceFor = (rawUrl) => {
    const url = new URL(rawUrl, 'http://preview.local');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/events') return url.searchParams.has('event') ? 'event' : 'events';
    if (path === '/services') return url.searchParams.has('service') ? 'service' : 'services';
    if (path === '/donate') return 'donate';
    if (path === '/articles' || path === '/articles/all') return 'articles';
    if (path.startsWith('/articles/')) return 'article';
    if (path === '/campaigns') return 'campaigns';
    if (path.startsWith('/campaigns/')) return 'campaign';
    if (path === '/courses') return 'course';
    return 'home';
  };

  const server = createServer(async (req, res) => {
    try {
      const files = loadArtifactDir(dir);
      const url = new URL(req.url ?? '/', 'http://preview.local');
      if (url.pathname === '/model') {
        // The model, where the developer lives: the registry beside the LIVE data this preview
        // renders (preview-content.json overlay included).
        const manifest = JSON.parse(files['manifest.json'] ?? '{}');
        const site = applyPreviewContent(buildSiteFixture(manifest), loadPreviewContent(dir, contentPath));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(renderModelReferenceHtml(site));
        return;
      }
      const previewContent = loadPreviewContent(dir, contentPath);
      const html = await renderStudioPreview(files, {
        behaviorsRuntime,
        fixtureImageBase,
        previewContent,
        contentImageOrigins: imageOriginsOf(previewContent),
        surface: surfaceFor(req.url ?? '/')
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch (e) {
      const { errors } = await validateArtifact(loadArtifactDir(dir)).catch(() => ({ errors: [] }));
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Template error</title>
<body style="font:14px/1.5 system-ui;padding:2rem;max-width:48rem;margin:auto">
<h1>The template didn't render</h1>
<p><code>${String(e instanceof Error ? e.message : e).replace(/</g, '&lt;')}</code></p>
${errors.length ? `<h2>Validation says</h2><ul>${errors.map((x) => `<li>${String(x).replace(/</g, '&lt;')}</li>`).join('')}</ul>` : ''}
<p>Fix and refresh, files are re-read on every request.</p>`);
    }
  });

  // A taken port is the most likely first-run failure (a forgotten dev server from another
  // template), and a raw EADDRINUSE stack reads like the kit is broken. Name the fix instead.
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`✗ port ${port} is already in use, another preview is probably still running.`);
      console.error(`  Stop it, or start this one elsewhere:  p60-template-kit dev ${args._[0] ?? '.'} --port ${port + 1}`);
      process.exit(1);
    }
    throw e;
  });

  server.listen(port, () => {
    console.log(`✓ preview at http://localhost:${port}, refresh after edits`);
    console.log('  watching for changes; validation runs on save:');
  });

  let pending = null;
  watch(dir, { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(async () => {
      const { errors, warnings } = await validateArtifact(loadArtifactDir(dir))
          .catch((e) => ({ errors: [String(e)], warnings: [] }));
      const stamp = new Date().toLocaleTimeString();
      if (errors.length === 0) {
        console.log(`  [${stamp}] ✓ valid${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}`);
      } else {
        console.log(`  [${stamp}] ✗ ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
        for (const e of errors) console.log(`      - ${e}`);
      }
    }, 200);
  });
}
