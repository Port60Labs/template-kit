const COLOR = /^(?:|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))$/;

/** Resolve presentation only. Invalid stored choices fall back without changing tenant data;
 * an explicit blank colour or declared blank option still means no emitted override. */
export function resolveDesignSettingValue(knob, stored, knownFamily) {
  const valid = value => {
    if (knob.kind === 'toggle') return typeof value === 'boolean' || value === 'true' || value === 'false';
    if (typeof value !== 'string') return false;
    if (knob.kind === 'color') return COLOR.test(value);
    if (knob.kind === 'select') return Array.isArray(knob.options) && knob.options.includes(value);
    if (knob.kind === 'font') return knownFamily(value) !== null;
    return false;
  };
  const candidate = stored ?? knob.default;
  const resolved = valid(candidate) ? candidate : valid(knob.default) ? knob.default : null;
  return resolved === null ? null : String(resolved);
}

/** The live host and both template preview dialects stamp exactly the same resolved settings. */
export function resolveDesignSettings(schema, overrides, { knownFamily, fontStackFor }) {
  const bodyAttrs = {};
  const colorVars = [];
  const fontSlots = [];
  for (const knob of schema ?? []) {
    const value = resolveDesignSettingValue(knob, Object.hasOwn(overrides, knob.key) ? overrides[knob.key] : undefined, knownFamily);
    if (value === null || value === '') continue;
    if (knob.kind === 'color') colorVars.push(`--p60s-${knob.key}: ${value};`);
    else if (knob.kind === 'font') {
      fontSlots.push({ family: value, weights: [...(knob.weights ?? [])] });
      colorVars.push(`--p60s-${knob.key}: ${fontStackFor(value)};`);
    } else bodyAttrs[`data-p60s-${knob.key}`] = value;
  }
  return { bodyAttrs, colorVars, fontSlots };
}
