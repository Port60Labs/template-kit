export const HEADING_ALIGNMENTS = Object.freeze(['start', 'center', 'end']);

export function headingAlignmentCapabilities(manifest) {
  if (manifest?.format !== 'port60-liquid@2') return {};
  const declared = manifest?.supports?.sectionHeadingAlignment;
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) return {};
  const sections = manifest?.supports?.sections;
  if (!Array.isArray(sections)) return {};
  const result = {};
  for (const [type, options] of Object.entries(declared)) {
    if (!sections.includes(type) || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(type)) continue;
    if (!Array.isArray(options) || !options.length || options.length > 3
      || options.some(option => !HEADING_ALIGNMENTS.includes(option))
      || new Set(options).size !== options.length) continue;
    Object.defineProperty(result, type, { value: [...options], enumerable: true });
  }
  return result;
}

export function withHeadingAlignment(content, type, manifest) {
  const projected = { ...content };
  const capabilities = headingAlignmentCapabilities(manifest);
  const options = Object.hasOwn(capabilities, type) ? capabilities[type] : undefined;
  if (!options?.includes(projected.headingAlignment)) delete projected.headingAlignment;
  return projected;
}
