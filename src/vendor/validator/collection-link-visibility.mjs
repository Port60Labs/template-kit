import { parsePresentationMarkup, presentationText, presentationVisible, presentationSignature } from './presentation-proof.mjs';

export const COLLECTION_LINK_TYPES = ['events', 'articles', 'courses', 'campaigns', 'services', 'documents', 'appealGrid'];
const ATTRIBUTE = 'data-p60-collection-link';

/** render receives raw saved values and a destination override; the caller applies host projection. */
export async function proveCollectionLinkVisibility(render, entry, declared) {
  const errors = [];
  const href = `/p60-collection-link-${entry.type}`;
  const content = { ...structuredClone(entry.sample ?? {}) };
  // Authored appeal cards intentionally replace the connected causes collection.
  if (entry.type === 'appealGrid') content.items = [];
  delete content.showCollectionLink;
  let baseline;
  for (const requested of [undefined, true, false, 'false', null, 0]) {
    const label = requested === undefined ? 'default' : JSON.stringify(requested);
    try {
      const html = await render({ ...content, ...(requested === undefined ? {} : { showCollectionLink: requested }) }, href);
      const { nodes, root } = parsePresentationMarkup(html);
      const hooks = nodes.filter(node => Object.hasOwn(node.attrs, ATTRIBUTE));
      const expectedHidden = declared && requested === false;
      if (declared && !hooks.length) errors.push(`${label}: must retain a permanent data-p60-collection-link anchor`);
      for (const hook of hooks) {
        if (hook.tag !== 'a' || hook.attrs.href !== href || !presentationText(hook)) {
          errors.push(`${label}: collection link hook must mark a nonempty onward anchor using the supplied collection href, not a section, card or record link`);
          continue;
        }
        if (('hidden' in hook.attrs) !== expectedHidden) errors.push(`${label}: only boolean false may add hidden to the onward anchor`);
        const attrs = hook.attrs;
        hook.attrs = { ...attrs };
        delete hook.attrs.hidden;
        if (!presentationVisible(hook)) errors.push(`${label}: the onward anchor must otherwise be visible, not hidden by its ancestor or another attribute`);
        hook.attrs = attrs;
      }
      const signature = presentationSignature(root, node => Object.hasOwn(node.attrs, ATTRIBUTE) ? ['hidden'] : []);
      if (baseline === undefined) baseline = signature;
      else if (signature !== baseline) errors.push(`${label}: visibility may change only the onward anchor hidden attribute, never copy, URLs, headings, records or other markup`);
    } catch (error) { errors.push(`${label}: failed rendering visibility fixture, ${error.message}`); }
  }
  if (declared) {
    try {
      const { nodes } = parsePresentationMarkup(await render(content, null));
      if (nodes.some(node => Object.hasOwn(node.attrs, ATTRIBUTE))) errors.push('missing destination: omit the onward anchor rather than inventing a URL');
    } catch (error) { errors.push(`missing destination: failed rendering fixture, ${error.message}`); }
  }
  return [...new Set(errors)].map(message => `section '${entry.type}' showCollectionLink: ${message}`);
}
