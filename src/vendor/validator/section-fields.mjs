import { parsePresentationMarkup, presentationVisible, presentationText } from './presentation-proof.mjs';
import { proveIntroPhotoFraming } from './intro-photo-framing.mjs';

/** A photo is an optional section field, including when no layout variants are offered. */
export async function proveSectionFields(render, entry, fields, { fieldMarkers = false, css = '' } = {}) {
  if (!fields?.includes('imageUrl')) return [];
  const errors = [];
  const base = { ...structuredClone(entry.sample), imageUrl: '', imageAlt: '' };
  let baselineCopy;
  for (const [imageUrl, imageAlt] of [
    ['', ''], ['https://example.invalid/first-intro-photo.jpg', 'Our volunteers preparing parcels'],
    ['https://example.invalid/replaced-intro-photo.jpg', '<Community> & "Neighbours"'],
    ['https://example.invalid/replaced-intro-photo.jpg', ''], ['', ''], [undefined, undefined]
  ]) {
    try {
      const content = { ...base, imageUrl, imageAlt };
      if (imageUrl === undefined) { delete content.imageUrl; delete content.imageAlt; }
      const html = await render(content);
      const parsed = parsePresentationMarkup(html);
      const copy = presentationText(parsed.root);
      baselineCopy ??= copy;
      if (copy !== baselineCopy) errors.push('optional photograph edits must not change section copy or render alternative text as visible copy');
      const marked = parsed.nodes.filter(node => node.attrs['data-p60-field'] === 'imageUrl');
      const images = parsed.nodes.filter(node => node.tag === 'img' && node.attrs.src === imageUrl && presentationVisible(node));
      if (imageUrl) {
        if (images.length !== 1 || images[0].attrs.alt !== imageAlt) errors.push('imageUrl/imageAlt must render exactly once on the actual visible photograph with escaped authored alt text');
        if (fieldMarkers && (marked.length !== 1 || marked[0] !== images[0])) errors.push('data-p60-field="imageUrl" must mark only the actual photograph, never a wrapper or text node');
        if (marked.some(node => node.tag !== 'img')) errors.push('imageUrl field markers must target img elements');
        if (parsed.nodes.some(node => node.attrs['data-p60-field'] === 'imageAlt')) errors.push('imageAlt belongs in the photograph alt attribute, never an inline text field marker');
      } else if (marked.length || parsed.nodes.some(node => node.tag === 'img'
        || Object.hasOwn(node.attrs, 'data-p60-layout-has-media') || node.attrs['data-p60-layout-role'] === 'media')) {
        errors.push('missing or removed photograph must omit its media, marker and media-present flag, never a placeholder');
      }
    } catch (error) {
      errors.push(`failed rendering photograph fixture: ${error.message}`);
      return errors.map(error => `section '${entry.type}' optional fields: ${error}`);
    }
  }
  if (fields.includes('photoFraming')) errors.push(...await proveIntroPhotoFraming(render, entry, css));
  return [...new Set(errors)].map(error => `section '${entry.type}' optional fields: ${error}`);
}
