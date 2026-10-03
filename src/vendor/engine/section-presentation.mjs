import contract from '../contract/v2/presentation.json' with { type: 'json' };
import { sectionFieldCapabilities } from './section-fields.mjs';

export const PRESENTATION_CONTRACT = contract;
export const HEADING_SCALES = Object.freeze([...contract.controls.headingScale.options]);
export const SECTION_SPACINGS = Object.freeze([...contract.controls.sectionSpacing.options]);
export const IMAGE_OVERLAYS = Object.freeze([...contract.controls.imageOverlay.options]);
export const COLOUR_TREATMENTS = Object.freeze([...contract.controls.colourTreatment.options]);
export const SECTION_LAYOUTS = Object.freeze([...contract.controls.sectionLayout.options]);
export const SECTION_PRESENTATION_CONTROLS = Object.freeze(Object.fromEntries(
  Object.entries(contract.controls).filter(([, descriptor]) => descriptor.address[0] === 'presentation')
));
export const SECTION_ROOT_TAGS = Object.freeze(['section', 'article', 'div', 'main', 'aside', 'header', 'footer']);
const INTERACTIVE_MEDIA_TAGS = new Set(['a', 'button', 'form', 'input', 'select', 'textarea', 'details', 'summary', 'video', 'audio', 'canvas', 'iframe', 'object', 'embed']);
export function sectionLayoutInteractiveMedia(tag, attrs) {
  return INTERACTIVE_MEDIA_TAGS.has(tag) || Object.hasOwn(attrs, 'tabindex') || Object.hasOwn(attrs, 'contenteditable')
    || /(?:^|\s)(?:button|link|checkbox|radio|switch|slider|spinbutton|textbox|combobox|listbox|menuitem)(?:\s|$)/.test(attrs.role ?? '');
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A malformed declaration fails closed as one unit; no control is guessed from rendered content. */
export function readSectionPresentation(value, sections) {
  if (!object(value) || !Array.isArray(sections)) return null;
  const entries = Object.entries(value);
  if (entries.length > contract.sectionTypes.length) return null;
  const result = {};
  for (const [type, controls] of entries) {
    if (!contract.sectionTypes.includes(type) || !sections.includes(type) || !object(controls)
      || !Object.keys(controls).length) return null;
    result[type] = {};
    for (const [key, choice] of Object.entries(controls)) {
      if (!Object.hasOwn(SECTION_PRESENTATION_CONTROLS, key)) return null;
      const descriptor = SECTION_PRESENTATION_CONTROLS[key];
      if (descriptor.sectionTypes && !descriptor.sectionTypes.includes(type)) return null;
      if (!object(choice) || Object.keys(choice).length !== 2 || !Object.hasOwn(choice, 'options')
        || !Object.hasOwn(choice, 'default') || !Array.isArray(choice.options)
        || choice.options.length < descriptor.minimumOptions || choice.options.length > descriptor.options.length
        || new Set(choice.options).size !== choice.options.length
        || choice.options.some(option => !descriptor.options.includes(option)) || !choice.options.includes(choice.default)) return null;
      result[type][key] = { options: [...choice.options], default: choice.default };
    }
  }
  return result;
}

export function sectionPresentationCapabilities(manifest) {
  if (manifest?.format !== 'port60-liquid@2') return {};
  const controls = readSectionPresentation(manifest?.supports?.sectionPresentation, manifest?.supports?.sections) ?? {};
  for (const [type, section] of Object.entries(controls)) for (const key of Object.keys(section)) {
    const required = SECTION_PRESENTATION_CONTROLS[key].requiresSupport;
    if (required && manifest?.supports?.[required] !== true) return {};
    if (key === 'sectionLayout' && !sectionFieldCapabilities(manifest)[type]) delete section[key];
  }
  for (const [type, section] of Object.entries(controls)) if (!Object.keys(section).length) delete controls[type];
  return controls;
}

/** Project accepted explicit choices only. This never mutates or deletes saved preferences. */
export function withSectionPresentation(content, type, manifest) {
  const projected = { ...content };
  delete projected.presentation;
  const declared = sectionPresentationCapabilities(manifest)[type] ?? {};
  const saved = object(content?.presentation) ? content.presentation : {};
  const accepted = Object.fromEntries(Object.entries(declared)
    .filter(([key, choice]) => Object.hasOwn(saved, key) && choice.options.includes(saved[key]))
    .map(([key]) => [key, saved[key]]));
  if (Object.keys(accepted).length) projected.presentation = accepted;
  return projected;
}

/** Shape validation is shared by kit fixtures; exact support is a separate capability check. */
export function presentationValueErrors(value, type) {
  if (!object(value)) return ['must be an object of presentation overrides'];
  return Object.entries(value).flatMap(([key, saved]) => !Object.hasOwn(SECTION_PRESENTATION_CONTROLS, key)
    ? [`unknown presentation control '${key}'`]
    : type && SECTION_PRESENTATION_CONTROLS[key].sectionTypes && !SECTION_PRESENTATION_CONTROLS[key].sectionTypes.includes(type)
      ? [`${key} is not available for section '${type}'`]
    : SECTION_PRESENTATION_CONTROLS[key].options.includes(saved) ? []
      : [`${key} must be ${SECTION_PRESENTATION_CONTROLS[key].options.join(', ')}; omit it to inherit`]);
}

/** Immediate, bounded canvas patch. The final template render remains authoritative. */
export function applySectionPresentation(wrapper, capabilities, control, value) {
  if (!wrapper || typeof control !== 'string' || !Object.hasOwn(SECTION_PRESENTATION_CONTROLS, control)) return false;
  const type = wrapper.getAttribute('data-p60-editor-type');
  const canonicalType = contract.legacySectionAliases[type] ?? type;
  const accepted = readSectionPresentation(capabilities, contract.sectionTypes);
  const declaration = accepted?.[canonicalType]?.[control];
  if (!declaration || (value !== null && !declaration.options.includes(value))) return false;
  const descriptor = SECTION_PRESENTATION_CONTROLS[control];
  const hooks = [...wrapper.querySelectorAll(`[${descriptor.attribute}]`)]
    .filter(node => node.closest('[data-p60-editor-section]') === wrapper);
  const targets = descriptor.target === 'section-heading'
    ? hooks.filter(node => /^H[1-6]$/.test(node.tagName) && !node.closest('astro-island'))
    : hooks;
  // Validate the entire root patch before touching the DOM. Never widen a malformed hook.
  if (['section-root', 'section-colour-treatment', 'section-layout'].includes(descriptor.target) && (targets.length !== 1 || wrapper.children.length !== 1
    || targets[0] !== wrapper.firstElementChild || !SECTION_ROOT_TAGS.includes(targets[0].tagName.toLowerCase())
    || targets[0].closest('astro-island')
    || [...wrapper.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()))) return false;
  if (descriptor.target === 'section-colour-treatment' && targets[0].querySelector('astro-island, [data-p60-island]')) return false;
  if (descriptor.target === 'section-layout' && !validLayoutPatchRoot(targets[0])) return false;
  if (descriptor.target === 'section-image-treatment' && (targets.length !== 1
    || targets[0] !== wrapper.firstElementChild || !SECTION_ROOT_TAGS.includes(targets[0].tagName.toLowerCase())
    || targets[0].closest('astro-island') || !targets[0].querySelector('[data-p60-image-overlay-media]'))) return false;
  if (!targets.length) return false;
  for (const target of targets) target.setAttribute(descriptor.attribute, value === null ? '' : value);
  return true;
}

function validLayoutPatchRoot(root) {
  if (root.querySelector('astro-island, [data-p60-island]')) return false;
  const roles = [root, ...root.querySelectorAll('[data-p60-layout-role]')].filter(node => node.hasAttribute('data-p60-layout-role'));
  if (roles.some(node => !['frame', 'media', 'content'].includes(node.getAttribute('data-p60-layout-role')))) return false;
  const role = name => roles.filter(node => node.getAttribute('data-p60-layout-role') === name);
  const frame = role('frame'), media = role('media'), content = role('content');
  if (root.hasAttribute('data-p60-layout-has-media') !== (media.length > 0)) return false;
  if (!media.length) return frame.length <= 1 && content.length <= 1;
  const images = [media[0], ...media[0].querySelectorAll('img')].filter(node => node.tagName === 'IMG');
  return frame.length === 1 && media.length === 1 && content.length === 1
    && media[0].parentElement === frame[0] && content[0].parentElement === frame[0]
    && frame[0].children.length === 2
    && ![...frame[0].childNodes].some(node => node.nodeType === 3 && node.textContent.trim())
    && ![media[0], ...media[0].querySelectorAll('*')].some(node => sectionLayoutInteractiveMedia(node.tagName.toLowerCase(), Object.fromEntries([...node.attributes].map(attr => [attr.name, attr.value]))))
    && !media[0].textContent.trim()
    && images.some(node => node.getAttribute('src')?.trim());
}
