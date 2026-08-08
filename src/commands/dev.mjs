import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { renderStudioPreview } from '../vendor/validator/preview.mjs';
import { validateArtifact } from '../vendor/validator/validate.mjs';
import { loadArtifactDir } from '../lib/artifactFiles.mjs';

/**
 * `dev <dir> [--port 4400]` — the local preview: your template over the contract's kind fixtures,
 * the SAME render the studio and reviewers see (islands as placeholders, network-dead CSP).
 * Files are re-read on every request, so a browser refresh is the hot reload; file changes also
 * re-run validation into the terminal — the human watches the page, the agent watches the JSON.
 */
export async function dev(args) {
  const dir = resolve(args._[0] ?? '.');
  const port = Number(args.port ?? 4400);

  const server = createServer(async (req, res) => {
    try {
      const files = loadArtifactDir(dir);
      const html = await renderStudioPreview(files);
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
