import { contentModel } from '../vendor/engine/content-footprint.mjs';

/**
 * `model [--json]`, the content model, in hand. Prints every `site.content.*` collection with
 * its bound, its onward link and its fields; `--json` emits the registry verbatim for agents
 * (the same file the validator and the production renderer enforce, so it cannot drift).
 * The dev server serves the same reference with live example data at /model.
 */
export function model(args) {
  if (args.json) {
    console.log(JSON.stringify(contentModel, null, 2));
    return;
  }
  console.log(`site.content, content model ${contentModel.version}`);
  console.log('site also carries: ' + contentModel.siblings.keys.map((k) => `site.${k}`).join(', '));
  console.log('');
  for (const [name, collection] of Object.entries(contentModel.collections)) {
    const more = collection.moreHref ? ` · more at ${collection.moreHref}` : '';
    console.log(`site.content.${name}  (bounded at ${collection.cap}${more}, since ${collection.since})`);
    for (const [field, spec] of Object.entries(collection.item)) {
      const notes = [
        spec.nullable ? 'nullable' : null,
        spec.enumOpen ? `open enum${spec.enumOpen.length ? `: ${spec.enumOpen.join('|')}` : ''}` : null,
        spec.max ? `max ${spec.max}` : null
      ].filter(Boolean).join(', ');
      console.log(`    ${field}: ${spec.type}${notes ? `  (${notes})` : ''}`);
    }
    console.log('');
  }
  console.log('Rules: collections are bounded (link onward via moreHref); enums are open (branch and');
  console.log('fall back); nullable fields need a branch; the model only grows. Your footprint and');
  console.log('minimum model version are computed at publish, you never declare them. Live examples:');
  console.log('the /model page on your dev preview.');
}
