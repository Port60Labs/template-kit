// THE MODEL, VISIBLE (content model v1): a self-contained reference page the kit's dev server
// serves at /model, the registry's shape beside the LIVE example data the preview is rendering
// right now (preview-content.json overlay included), so "what can I read?" is answered where the
// developer already lives. Network-dead like every preview document.
import { contentModel } from '../engine/content-footprint.mjs';

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fieldRows(item) {
  return Object.entries(item)
    .map(([name, spec]) => {
      const notes = [];
      if (spec.nullable) notes.push('nullable, always branch');
      if (spec.enumOpen) {
        notes.push(spec.enumOpen.length
          ? `open enum: ${spec.enumOpen.join(', ')} today, more will arrive`
          : 'open enum');
      }
      if (spec.max) notes.push(`max ${spec.max} chars`);
      return `<tr><td><code>${escapeHtml(name)}</code></td><td>${escapeHtml(spec.type)}</td>` +
        `<td>${escapeHtml(notes.join(' · '))}</td><td>${escapeHtml(spec.since)}</td></tr>`;
    })
    .join('');
}

function exampleOf(site, name) {
  const items = site?.content?.[name];
  if (!Array.isArray(items) || items.length === 0) return null;
  return JSON.stringify(items[0], null, 2);
}

/** The /model page: registry + the live example values of THIS preview's site tree. */
export function renderModelReferenceHtml(site) {
  const sectionsHtml = Object.entries(contentModel.collections)
    .map(([name, model]) => {
      const example = exampleOf(site, name);
      return `<section id="${escapeHtml(name)}">
  <h2><code>site.content.${escapeHtml(name)}</code></h2>
  <p class="meta">bounded at <strong>${model.cap}</strong>${model.moreHref ? ` · more at <code>${escapeHtml(model.moreHref)}</code>` : ''} · since ${escapeHtml(model.since)}</p>
  <p>${escapeHtml(model.description)}</p>
  <table><thead><tr><th>Field</th><th>Type</th><th>Notes</th><th>Since</th></tr></thead>
  <tbody>${fieldRows(model.item)}</tbody></table>
  ${example ? `<details><summary>Live example (item 0 of what this preview is rendering)</summary><pre>${escapeHtml(example)}</pre></details>` : '<p class="meta">No items in the current preview data.</p>'}
</section>`;
    })
    .join('\n');

  const toc = Object.keys(contentModel.collections)
    .map((name) => `<a href="#${escapeHtml(name)}">${escapeHtml(name)}</a>`)
    .join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>site.content, the content model</title>
<style>
  body { font: 15px/1.6 system-ui, sans-serif; margin: 0 auto; max-width: 56rem; padding: 24px 20px 64px; color: #172029; background: #fbfbf9; }
  h1 { margin: 0 0 4px; } h2 { margin: 40px 0 2px; font-size: 20px; }
  .meta { color: #5a6672; font-size: 13px; margin: 2px 0 8px; }
  .lede { color: #3c4854; max-width: 46rem; }
  nav.toc { font-size: 13px; margin: 14px 0 6px; color: #5a6672; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th, td { text-align: left; border-bottom: 1px solid #e3e3dc; padding: 5px 10px 5px 0; vertical-align: top; }
  th { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: #5a6672; }
  code { background: #eeeee6; border-radius: 4px; padding: 1px 5px; font-size: 12.5px; }
  pre { background: #10161c; color: #dbe4ec; border-radius: 8px; padding: 12px 14px; overflow-x: auto; font-size: 12.5px; }
  details { margin: 8px 0 0; } summary { cursor: pointer; font-size: 13px; color: #5a6672; }
  .rules { background: #f0f0e8; border-radius: 10px; padding: 14px 18px; font-size: 13.5px; }
  .back { font-size: 13px; }
</style>
</head>
<body>
<p class="back"><a href="/">← back to the preview</a></p>
<h1>The content model</h1>
<p class="lede">Everything your template reads lives on one tree: <code>site.brand</code>, <code>site.nav</code>, <code>site.socials</code>, <code>site.locale</code> and the typed collections below. Model version <strong>${escapeHtml(contentModel.version)}</strong>. The validator computes your content footprint from the paths you read and stamps the minimum model version at publish, you never declare versions.</p>
<div class="rules">
  <strong>Four rules the model never breaks (so neither should you):</strong>
  every collection is bounded (cap + <code>moreHref</code>), link onward, never assume you have everything;
  enum fields are open, branch on the values you style, fall back for the rest;
  optional fields are explicitly nullable, always branch;
  the model only grows, nothing you read today is ever removed within the major.
  Replace the preview data with your own via <code>preview-content.json</code> (shape fixed, hot-reloaded, never packaged).
</div>
<nav class="toc">${toc}</nav>
${sectionsHtml}
</body>
</html>`;
}
