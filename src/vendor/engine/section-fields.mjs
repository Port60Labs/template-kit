export const INTRO_PHOTO_FIELDS = Object.freeze(['imageUrl', 'imageAlt']);
export const INTRO_OPTIONAL_FIELDS = Object.freeze([...INTRO_PHOTO_FIELDS, 'photoFraming']);
export const INTRO_PHOTO_FRAMING = Object.freeze(['fill', 'whole']);
export const INTRO_PHOTO_FRAMING_ATTRIBUTE = 'data-p60-photo-framing';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Optional field support is explicit per section and independent from layout variants. */
export function readSectionFields(value, sections) {
  if (!object(value) || !Array.isArray(sections)) return null;
  const result = {};
  for (const [type, fields] of Object.entries(value)) {
    if (type !== 'hero' || !sections.includes(type) || !Array.isArray(fields)
      || fields.length < INTRO_PHOTO_FIELDS.length || fields.length > INTRO_OPTIONAL_FIELDS.length || new Set(fields).size !== fields.length
      || INTRO_PHOTO_FIELDS.some(field => !fields.includes(field)) || fields.some(field => !INTRO_OPTIONAL_FIELDS.includes(field))) return null;
    result[type] = [...fields];
  }
  return result;
}

export function sectionFieldCapabilities(manifest) {
  return manifest?.format === 'port60-liquid@2'
    ? readSectionFields(manifest?.supports?.sectionFields, manifest?.supports?.sections) ?? {} : {};
}

/** Conservative public projection of the server's bounded image URL policy, not a fetch operation. */
export function safeSectionImageUrl(value, { fixture = false } = {}) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\u0000-\u0020\u007f-\u009f\\]/.test(value)) return undefined;
  if (fixture && /^p60(?:fixture|preview):[^\s\\]+$/.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (!/^https?:\/\/[^/]/i.test(value)) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? value : undefined;
  } catch { return undefined; }
}

/** Retain tenant-owned stored fields, projecting only safe fields accepted by this artifact. */
export function withSectionFields(content, type, manifest, options) {
  if (type !== 'hero' || manifest?.format !== 'port60-liquid@2') return content;
  const projected = { ...content };
  for (const field of INTRO_OPTIONAL_FIELDS) delete projected[field];
  const fields = sectionFieldCapabilities(manifest).hero;
  if (!fields) return projected;
  const imageUrl = safeSectionImageUrl(content?.imageUrl, options);
  if (imageUrl) {
    projected.imageUrl = imageUrl;
    projected.imageAlt = typeof content?.imageAlt === 'string' ? content.imageAlt : '';
    if (fields.includes('photoFraming') && INTRO_PHOTO_FRAMING.includes(content?.photoFraming)) projected.photoFraming = content.photoFraming;
  }
  return projected;
}

/** Patch only this section's existing photo, leaving its source, content and neighbours intact. */
export function applySectionPhotoFraming(wrapper, fields, value) {
  if (!wrapper || wrapper.getAttribute('data-p60-editor-type') !== 'hero'
    || !readSectionFields(fields, ['hero'])?.hero?.includes('photoFraming')
    || (value !== null && !INTRO_PHOTO_FRAMING.includes(value))) return false;
  const hooks = [...wrapper.querySelectorAll(`[${INTRO_PHOTO_FRAMING_ATTRIBUTE}]`)]
    .filter(node => node.closest('[data-p60-editor-section]') === wrapper);
  if (hooks.length !== 1 || hooks[0].tagName !== 'IMG' || hooks[0].getAttribute('data-p60-field') !== 'imageUrl'
    || hooks[0].closest('astro-island, [data-p60-island]') || !safeSectionImageUrl(hooks[0].getAttribute('src'))) return false;
  hooks[0].setAttribute(INTRO_PHOTO_FRAMING_ATTRIBUTE, value ?? '');
  return true;
}
