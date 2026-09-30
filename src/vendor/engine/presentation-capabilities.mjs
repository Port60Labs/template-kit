// Exact-artifact opt-ins. Preferences survive template switches in the stored document;
// only supported values reach the render context or the editor's controls.
export const NAVIGATION_MODES = Object.freeze(['simple', 'mega']);
export const COLLECTION_LINK_SECTIONS = Object.freeze([
  'events', 'articles', 'courses', 'campaigns', 'services', 'documents', 'appealGrid'
]);

/** Editor addition limit, not a mutation or truncation of previously saved photographs. */
export function heroImageLimitCapability(manifest) {
  if (manifest?.supports?.heroImagery !== true) return 0;
  const limit = manifest.supports.heroImageLimit;
  return manifest.format === 'port60-liquid@2' && Number.isInteger(limit) && limit >= 1 && limit <= 6 ? limit : 1;
}

export function navigationModeCapabilities(manifest) {
  if (manifest?.format !== 'port60-liquid@2' || manifest?.supports?.layout !== true) return null;
  const declared = manifest.supports.navigationModes;
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) return null;
  const { options, default: fallback } = declared;
  if (!Array.isArray(options) || options.length !== 2 || new Set(options).size !== 2
    || options.some(option => !NAVIGATION_MODES.includes(option)) || !options.includes(fallback)) return null;
  return { options: [...options], default: fallback };
}

export function resolvedNavigationMode(manifest, preference) {
  const capability = navigationModeCapabilities(manifest);
  return capability ? (capability.options.includes(preference) ? preference : capability.default) : undefined;
}

export function collectionLinkVisibilityCapabilities(manifest) {
  if (manifest?.format !== 'port60-liquid@2') return [];
  const sections = manifest?.supports?.sections;
  const declared = manifest?.supports?.sectionCollectionLinkVisibility;
  if (!Array.isArray(sections) || !Array.isArray(declared) || !declared.length
    || new Set(declared).size !== declared.length
    || declared.some(type => !COLLECTION_LINK_SECTIONS.includes(type) || !sections.includes(type))) return [];
  return [...declared];
}

export function withCollectionLinkVisibility(content, type, manifest) {
  const projected = { ...content };
  if (!collectionLinkVisibilityCapabilities(manifest).includes(type)
    || typeof projected.showCollectionLink !== 'boolean') delete projected.showCollectionLink;
  return projected;
}
