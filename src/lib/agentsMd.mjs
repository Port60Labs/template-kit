import { readFileSync } from 'node:fs';

const KIT_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

// A contract briefing shared by every generated coding-agent instruction file.
export function agentsMd(name) {
  return `# Working on the "${name}" Port60 template

This is a Liquid and CSS artifact, not an application. The platform owns public eligibility,
routes, consent, authentication, payments and interactive islands. Preserve the design's visual
identity, authored content and inline editing markers while changing presentation.

## Versions and iteration

Use format port60-liquid@2, content model 2.0 and kit ${KIT_VERSION}. Existing v1 platform pins retain
their historical contract; this kit explicitly rejects v1 for new authoring and uploads.
Never relabel v1 without migrating its reads. Published name/version identities are immutable.

- npm run validate:json is the machine-readable feedback loop. Fix all errors after each edit.
- npm run validate checks the same contract as upload.
- npm run dev previews all supported pages locally.
- npm run package validates and writes the uploadable zip.
- npm run release builds a store release with separate template/ and preview/ bundles.
- p60-template-kit setup-previews installs the pinned build browser once (CI: --with-deps).
- Check all Looks, empty states, long text and mobile layouts. Validation is not visual QA.

## Artifact shape

manifest.json declares support. layout.liquid has exactly one {% content %} slot.
sections/<type>.liquid implements catalogued types; pages/<page>.liquid implements declared
page templates. assets/theme.css is the only loaded stylesheet. No JavaScript, fonts, API calls,
remote CSS imports or image files belong in the runtime artifact. preview/ contains independent
author-demo inputs. Its config.json names a content JSON file and optional widget focus. Put
author JPEG/PNG/WebP imagery in preview/media/ and use p60preview:filename references in that
content. The release builder seals every Look and publishes that imagery only in the separate
preview/ bundle. Runtime package/publish ZIPs never contain it. Studio preview-bundle intake is
separate from the first-party store release lane. Use platform media URLs in runtime content.

Release automatically captures each Look as a 960x600 WebP under preview/gallery/, from a
1440x900 desktop render. Do not author separate screenshots. Posters have a 160 KiB cap;
HTML, images and metadata remain beside them. The gallery loads posters; details load HTML.
The build needs Chromium plus access to fonts.bunny.net, and refuses failed required assets.
Use the same kit/browser/OS for immutable-upload retries; bump the version for changed output.
Arabic-specific poster font fidelity is deferred, not proof of Arabic-locale conformance.

## The only public site tree

Read site.brand, site.nav, site.socials, site.locale, site.actions, site.page and site.content.
No flat brand/nav/collection aliases or site.focus exist. A section also receives section, its
current instance's raw authored content. Article/course details retain their documented record
context. impactMap receives the selected map with its contained points, never root locations.

services/events/articles/campaigns/causes/courses/documents are envelopes:
{label, href, items, pagination}. Iterate site.content.events.items, not the envelope.
Documents href can be null. Pagination is null outside listings, otherwise it carries page,
size, totalElements, totalPages, nextHref and previousHref. Use supplied URLs, not guessed routes.
Only site.content.schedules stays an array. Lists are bounded; enum values are open, so always
include fallbacks. Nullable values need guards. Metadata-only label/href/pagination reads do
not fetch items, but whole-envelope aliases do. Dynamic indexing of the site tree is refused.

The current render is site.page = {key, path, sections:[{key,type,content}]}.
Repeated section types have independent stable keys. Canonical section types include services,
courses, events and documents. No programmes, whatsOn, infoEvents, resources, locations or
content.about public aliases exist. Documents remain selected existing public records, never
an automatically exposed media library. Section support does not confer source entitlements.

## Authored ownership and clearing

For collection introductions, absent section.title inherits site.content.<collection>.label;
an explicit empty string hides it; other text overrides it. subtitle and eyebrow are authored.
Use nil checks, not Liquid default, wherever clearing has meaning. Keep generated labels out
of raw section content. Mark an authored title only in the nonempty override branch. An inherited
heading has no data-p60-field marker.

Declare supports.fieldMarkers:true when showing authored field markers. A marker such as
data-p60-field="title" or data-p60-field="items.{{ forloop.index0 }}.label" addresses only that
section's content. Its node must contain exactly the authored value. Use a span when punctuation
or generated text surrounds it. Never mark source records, generated labels or resolved actions.

## Navigation and actions

site.nav.header and site.nav.footer are independent arrays. kind link has href; kind group has
null href and children. Use disclosure controls for groups, not fake links. Render two child
levels and preserve description, imageUrl and optional megaMenu.promo. No derived menus, CTA
flags or generated columns exist. The template owns responsive menu layout.
supports.navigationHighlights:true must render supplied promos, including text-only cards,
without losing normal links. The nav behaviour alone never enables this feature.
site.actions.header and site.actions.hero are resolved actions or null. site.actions.widget is
donate, volunteer or none. Do not infer actions from navigation. Authored hero override text
retains its field marker; resolved fallback actions do not.

## Safety and design

- Output is escaped. Use raw only for contract-sanitised richtext.
- The dialect is whitelisted. include/render/layout and unknown filters are rejected.
- Place declared islands with {% island 'donation_widget' %}. Style their stable API and never
  recreate transactions, API calls, forms, identity or consent logic.
- Render collection envelopes with template markup and declared behaviours. The historical
  events_carousel, whats_on_strip and latest_articles islands are v1-only and rejected by v2.
  Collection route continuation belongs to the host, not a second template data fetch or pager.
- Declare only what you render, and render what you declare. Capability matching is metadata,
  not a transfer of route ownership or tenant entitlements.
- Hero photos need a palette scrim, a carousel for multiple photos and a designed no-photo state.
- Preserve settings and Looks. Use platform fonts and declared CSS tokens.
- The host owns lang/dir and Arabic fonts. Use logical CSS properties. Read site.locale.code.
- The next coordinated kit release adds t for supported interface phrases and local_date for
  fixed Gregorian date/datetime formatting in UTC. Do not use these on registry kit 1.0.0.
  Never translate authored text, infer prayer identities from translated names or convert
  supplied prayer wall-clock strings. Details: /guides/localisation/ in the developer docs.
- Scope behaviour-dependent hidden content under .p60-js so no-JavaScript stays readable.
- Keep loops bounded. Test empty collections, cleared text and unknown enum values.

## Data and reference

p60-template-kit content . writes editable envelope fixtures, independent header/footer menus
and keyed page compositions. p60-template-kit dev . --content my.json previews those fixtures.
Overrides are schema-checked, never packaged and never replace canonical conformance fixtures.
The dev server /model shows live values beside the registry. p60-template-kit model --json
prints the current model. Generated reference: https://developers.port60.com/reference/content-model/
Full agent reference: https://developers.port60.com/llms-full.txt
`;
}
