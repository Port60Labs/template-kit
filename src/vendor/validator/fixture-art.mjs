// FIXTURE ART — the studio's sealed imagery. Fixtures reference imagery as `p60fixture:<kind>/<seed>`
// and this module resolves every reference before a render: by default to a deterministic inline-SVG
// scene (a data: URI, so the network-dead studio CSP renders it), or — when the caller passes an
// `imageBase` — to `<imageBase>/<kind>-<seed>.jpg`, the dev-richer half of the dev-richer /
// studio-sealed split (the same shape as the behaviour runtime: the kit's dev server may opt into
// the one platform CDN host; the studio document never fetches anything).
//
// The art is deliberately scenery, not labels: layered gradients, a horizon, soft shapes — enough
// composition that cards, carousels and banners read like a real site rather than a wireframe.
// Deterministic by seed so goldens stay byte-identical run to run.

const PALETTES = {
  hero: [['#27413a', '#0f2b22', '#c9a961'], ['#1f3550', '#0c1a2c', '#d08c4a'], ['#3c2f42', '#191423', '#c96f6f']],
  event: [['#2c2440', '#141024', '#e0a458'], ['#402438', '#1f0f1c', '#d97f6a'], ['#1f3345', '#0d1a26', '#7fb3d9']],
  article: [['#39404a', '#20242b', '#a9b6c4'], ['#414036', '#24231c', '#c4b58e']],
  campaign: [['#59332a', '#2b1712', '#e8a15f'], ['#2a4759', '#122430', '#7fc4b0']],
  cause: [['#5c3040', '#2c1420', '#e0937f'], ['#33504a', '#152824', '#a5c98e']],
  service: [['#2f4d3e', '#132a1f', '#9fc490'], ['#31495c', '#14222e', '#8fb8c9']],
  people: [['#4d4238', '#292019', '#d3a97c'], ['#3d4550', '#1f242b', '#b0a3c4']],
  course: [['#2d4a55', '#112530', '#83c1b0'], ['#4a3c2d', '#251d11', '#c1a583']],
  media: [['#26243a', '#100e1e', '#8f7fd9'], ['#3a2430', '#1e0f18', '#d97fae']],
  volunteer: [['#3e4a2d', '#1e2511', '#b7c183'], ['#2d3f4a', '#111e25', '#83a9c1']],
  impact: [['#44503c', '#232b1e', '#c2cf9f'], ['#503c46', '#2b1e25', '#cf9fb4']]
};

const SIZES = { wide: [160, 90], photo: [150, 100], portrait: [96, 120] };

// A tiny deterministic PRNG seeded from the reference string — good enough for composition,
// stable across runs and platforms.
function rng(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

function scene(kind, seed, aspect) {
  const [w, hgt] = SIZES[aspect] ?? SIZES.wide;
  const random = rng(`${kind}/${seed}`);
  const set = PALETTES[kind] ?? PALETTES.hero;
  const [top, bottom, accent] = set[Math.floor(random() * set.length)];

  // Horizon line + two hill paths, varied by seed.
  const horizon = hgt * (0.52 + random() * 0.2);
  const hill = (base, amp, fill, opacity) => {
    const y1 = base - amp * random();
    const y2 = base - amp * random();
    const y3 = base - amp * random();
    return `<path d='M0 ${base.toFixed(1)} C ${w * 0.2} ${y1.toFixed(1)}, ${w * 0.4} ${y2.toFixed(1)}, ${w * 0.6} ${y3.toFixed(1)} S ${w} ${y1.toFixed(1)}, ${w} ${base.toFixed(1)} L ${w} ${hgt} L 0 ${hgt} Z' fill='${fill}' opacity='${opacity}'/>`;
  };

  // A sun/moon disc and a small cluster of soft foreground shapes.
  const discX = w * (0.15 + random() * 0.7);
  const discY = horizon * (0.35 + random() * 0.4);
  const discR = 6 + random() * (w / 14);
  const clusters = Array.from({ length: 3 }, () => {
    const cx = w * random();
    const cy = horizon + (hgt - horizon) * random();
    const r = 2 + random() * 6;
    return `<circle cx='${cx.toFixed(1)}' cy='${cy.toFixed(1)}' r='${r.toFixed(1)}' fill='${accent}' opacity='${(0.12 + random() * 0.2).toFixed(2)}'/>`;
  }).join('');

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${hgt}'>` +
    `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'>` +
    `<stop offset='0' stop-color='${top}'/><stop offset='1' stop-color='${bottom}'/>` +
    `</linearGradient></defs>` +
    `<rect width='${w}' height='${hgt}' fill='url(#s)'/>` +
    `<circle cx='${discX.toFixed(1)}' cy='${discY.toFixed(1)}' r='${discR.toFixed(1)}' fill='${accent}' opacity='.55'/>` +
    hill(horizon, hgt * 0.22, bottom, '.85') +
    hill(hgt * 0.82, hgt * 0.14, top, '.9') +
    clusters +
    `<rect width='${w}' height='${hgt}' fill='${bottom}' opacity='.08'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const REF = /^p60fixture:([a-z]+)\/([a-z0-9-]+)(?:\/(wide|photo|portrait))?$/;

/** Resolve one `p60fixture:` reference, or return the value untouched. */
export function resolveFixtureImage(value, options = {}) {
  if (typeof value !== 'string') return value;
  const m = REF.exec(value);
  if (!m) return value;
  const [, kind, seed, aspect] = m;
  if (options.imageBase) {
    return `${String(options.imageBase).replace(/\/$/, '')}/${kind}-${seed}.jpg`;
  }
  return scene(kind, seed, aspect ?? 'wide');
}

/**
 * Deep-resolve every `p60fixture:` reference in a fixture tree. Returns a resolved copy; the
 * input is never mutated (renders with different options must not contaminate each other).
 */
export function resolveFixtureArt(value, options = {}) {
  if (typeof value === 'string') return resolveFixtureImage(value, options);
  if (Array.isArray(value)) return value.map((v) => resolveFixtureArt(v, options));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveFixtureArt(v, options);
    return out;
  }
  return value;
}
