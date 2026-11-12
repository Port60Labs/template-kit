export const fontSlug = (name) => String(name).toLowerCase().replace(/ /g, '-');

export function fontStoreBase(configured, fallback) {
  for (const candidate of [configured, fallback]) {
    try {
      const url = new URL(String(candidate ?? ''));
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) continue;
      if (!/^[A-Za-z0-9._~/-]*$/.test(url.pathname)) continue;
      return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    } catch {
    }
  }
  throw new Error('The font store address is not a plain http or https address');
}

export const fontStoreUrl = (faces, base) => `${base}/${faces.store}`;

export function nearestWeight(target, available) {
  let best = available[0];
  for (const weight of available) {
    const distance = Math.abs(weight - target);
    const bestDistance = Math.abs(best - target);
    if (distance < bestDistance || (distance === bestDistance && weight > best)) best = weight;
  }
  return best;
}

export function storedFontWeights(faces, slots) {
  const weightsByFamily = new Map();
  for (const slot of slots) {
    const family = faces.families[slot.family];
    if (!family) continue;
    const weights = weightsByFamily.get(slot.family) ?? new Set();
    const asked = slot.weights?.length > 0 ? slot.weights : [400, 700];
    for (const weight of asked) weights.add(nearestWeight(weight, family.weights));
    weightsByFamily.set(slot.family, weights);
  }
  return [...weightsByFamily].map(([family, weights]) => ({ family, weights: [...weights].sort((a, b) => a - b) }));
}

export function fontFaceRules(faces, slots, storeUrl) {
  const rules = [];
  for (const { family, weights } of storedFontWeights(faces, slots)) {
    const { slug, subsets } = faces.families[family];
    for (const weight of weights) {
      for (const [subset, range] of subsets) {
        rules.push(`@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url(${storeUrl}/${slug}/${slug}-${subset}-${weight}-normal.woff2) format('woff2');unicode-range:${range}}`);
      }
    }
  }
  return rules;
}

export function fontFilePath(faces, url, base) {
  const prefix = `${fontStoreUrl(faces, base)}/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  return /^[a-z0-9-]+\/[a-z0-9-]+\.woff2$/.test(path) ? `${faces.store}/${path}` : null;
}

export function declaredFontSlots(faces, declared) {
  const slots = [];
  let query;
  try {
    query = new URL(String(declared)).search.slice(1);
  } catch {
    return slots;
  }
  for (const param of query.split('&')) {
    if (!param.startsWith('family=')) continue;
    let value;
    try {
      value = decodeURIComponent(param.slice(7).replace(/\+/g, ' '));
    } catch {
      continue;
    }
    const [name, spec = ''] = value.split(':', 2);
    const family = faces.families[name];
    if (!family) continue;
    const [axes = '', tuples = ''] = spec.split('@', 2);
    const position = axes.split(',').indexOf('wght');
    const asked = position < 0 ? ['400'] : tuples.split(';').map((tuple) => tuple.split(',')[position]).filter(Boolean);
    const weights = new Set();
    for (const entry of asked) {
      const [from, to = from] = entry.split('..').map(Number);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      const inside = family.weights.filter((weight) => weight >= from && weight <= to);
      for (const weight of inside.length > 0 ? inside : [nearestWeight(from, family.weights)]) weights.add(weight);
    }
    if (weights.size > 0) slots.push({ family: name, weights: [...weights] });
  }
  return slots;
}
