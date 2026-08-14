import { createServer } from 'node:http';
import { watch, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderStudioPreview } from '../vendor/validator/preview.mjs';
import { validateArtifact } from '../vendor/validator/validate.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';

/**
 * `dev <dir> [--port 4400]` — the local preview: your template over the contract's kind fixtures,
 * the SAME render the studio and reviewers see (islands as fixture-hydrated skeletons,
 * network-dead CSP). ONE addition over the studio render: the platform's own behaviour runtime is
 * inlined, so data-p60-* carousels, reveals and tabs run for real locally — the only script the
 * document can execute. Files are re-read on every request, so a browser refresh is the hot
 * reload; file changes also re-run validation into the terminal — the human watches the page,
 * the agent watches the JSON.
 */
export async function dev(args) {
  const dir = resolve(args._[0] ?? '.');
  const port = Number(args.port ?? 4400);
  let behaviorsRuntime = null;
  try {
    behaviorsRuntime = readFileSync(
      resolve(import.meta.dirname, '../vendor/validator/behaviors-runtime.js'), 'utf8');
  } catch {
    // An older vendored copy without the runtime — the preview degrades to the CSS approximation.
  }

  // The preview is ROUTED: nav links land on real surfaces, so an author sees every platform
  // page wearing their chrome — their own page template where they ship one, the platform's
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
      const html = await renderStudioPreview(files, { behaviorsRuntime, surface: surfaceFor(req.url ?? '/') });
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
<p>Fix and refresh — files are re-read on every request.</p>`);
    }
  });

  // A taken port is the most likely first-run failure (a forgotten dev server from another
  // template), and a raw EADDRINUSE stack reads like the kit is broken. Name the fix instead.
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`✗ port ${port} is already in use — another preview is probably still running.`);
      console.error(`  Stop it, or start this one elsewhere:  p60-template-kit dev ${args._[0] ?? '.'} --port ${port + 1}`);
      process.exit(1);
    }
    throw e;
  });

  server.listen(port, () => {
    console.log(`✓ preview at http://localhost:${port} — refresh after edits`);
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
