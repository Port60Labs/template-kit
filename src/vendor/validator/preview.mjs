// The STUDIO PREVIEW renderer (developer program T1.3): a validated artifact rendered over the
// contract's KIND FIXTURES — no tenant, no tenant data, exactly what `template-kit dev` will show
// locally in T3. Deliberately NOT the production TemplateHost path: a studio version must never
// touch a live site, so this renders from an in-memory file map and the page it produces is
// self-contained and network-dead — a CSP meta of default-src 'none' means the template's CSS
// cannot fetch, beacon or import anything, and the consumer embeds it in a sandboxed iframe.
// Islands render as labelled placeholder boxes (previews carry no runtime).
import { Liquid } from 'liquidjs';
import { CONTENT_SLOT, configureDialect, splitIslandParts } from '../engine/dialect.mjs';
import { LIQUID_BUDGETS } from '../engine/budgets.mjs';
import dialect from '../contract/v1/dialect.json' with { type: 'json' };
import sectionCatalogue from '../contract/v1/sections.json' with { type: 'json' };
import islandRegistry from '../contract/v1/islands.json' with { type: 'json' };
import contextContract from '../contract/v1/context.json' with { type: 'json' };

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function islandPlaceholder(name) {
  return `<div class="p60-preview-island" role="note">island: ${escapeHtml(name)}</div>`;
}

function partsToHtml(html, contentHtml) {
  let out = '';
  for (const part of splitIslandParts(html)) {
    if (part.island === CONTENT_SLOT) out += contentHtml ?? '';
    else if (part.island) out += islandPlaceholder(part.island);
    else out += part.html;
  }
  return out;
}

/** Knob defaults → the same body attributes / CSS vars TemplateHost stamps, minus network fonts
 *  (the CSP kills font fetches by design; system fallbacks are fine for a structural preview). */
function knobDefaults(manifest) {
  const attrs = [];
  const vars = [];
  for (const knob of manifest?.settings?.schema ?? []) {
    const value = knob.default;
    if (value == null || value === '') continue;
    if (knob.kind === 'color') {
      if (/^#[0-9a-fA-F]{3,8}$/.test(String(value))) vars.push(`--p60s-${knob.key}: ${value};`);
    } else if (knob.kind === 'font') {
      vars.push(`--p60s-${knob.key}: '${String(value).replace(/'/g, '')}', system-ui, sans-serif;`);
    } else {
      attrs.push(`data-p60s-${knob.key}="${escapeHtml(String(value))}"`);
    }
  }
  return { attrs: attrs.join(' '), vars: vars.join(' ') };
}

/**
 * Renders the artifact's declared sections (sample fixtures) inside its layout (when declared)
 * and returns a complete, self-contained HTML document. Throws on parse/render failure — callers
 * preview only versions the validator has already passed, so a throw here is a bug report, not
 * a user flow.
 */
export async function renderStudioPreview(files) {
  const manifest = JSON.parse(files['manifest.json']);
  const allIslands = new Set(islandRegistry.islands.map((i) => i.name));
  const liquid = new Liquid({ outputEscape: 'escape', strictFilters: true, ...LIQUID_BUDGETS });
  configureDialect(liquid, dialect, allIslands);

  const catalogueByType = new Map(sectionCatalogue.sections.map((s) => [s.type, s]));
  const brand = contextContract.fixtures.brand;

  const sectionsHtml = [];
  for (const type of manifest?.supports?.sections ?? []) {
    const entry = catalogueByType.get(type);
    const source = files[`sections/${type}.liquid`];
    if (!entry || source == null) continue;
    const rendered = await liquid.parseAndRender(source, { section: entry.sample ?? {}, brand });
    sectionsHtml.push(partsToHtml(rendered, ''));
  }
  const contentHtml = sectionsHtml.join('\n');

  let bodyHtml;
  if (manifest?.supports?.layout && files['layout.liquid'] != null) {
    const rendered = await liquid.parseAndRender(files['layout.liquid'], {
      brand,
      nav: contextContract.fixtures.layout.nav,
      socials: contextContract.fixtures.layout.socials ?? [],
      worship: manifest?.supports?.worship ? (contextContract.fixtures.layout.worship ?? null) : null
    });
    bodyHtml = partsToHtml(rendered, contentHtml);
  } else {
    bodyHtml = contentHtml;
  }

  const themeCss = files['assets/theme.css'] ?? '';
  const { attrs, vars } = knobDefaults(manifest);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- Network-dead by design: the template's CSS can style, never fetch. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(manifest?.label ?? manifest?.name ?? 'Template preview')} — studio preview</title>
<style>${vars ? `:root { ${vars} }` : ''}
.p60-preview-island { border: 2px dashed #8aa; border-radius: 8px; padding: 18px; margin: 8px 0;
  font: 13px/1.4 system-ui, sans-serif; color: #567; background: rgba(120,160,160,0.08); text-align: center; }
</style>
<style>${themeCss}</style>
</head>
<body ${attrs}>
${bodyHtml}
</body>
</html>`;
}
