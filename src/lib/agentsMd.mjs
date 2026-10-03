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

Heading alignment is an optional per-section capability, not a global theme setting. Declare
supports.sectionHeadingAlignment as a map, for example {"services":["start","center","end"]}.
Each key must also be in supports.sections; list only the nonempty, unique subset you implement.
Place data-p60-heading-align="{{ section.headingAlignment }}" on the actual h1 to h6 heading,
its eyebrow, or a wrapper containing only that heading and eyebrow. The heading itself must be
inside/on a matching hook; do not mark the whole section, cards, media, body copy or actions.
Omit section.headingAlignment for the template's authored default. Never use a Liquid default
filter or a hardcoded active hook value: absent/unsupported values must leave the design alone.
Keep the empty hook on every visible heading at the default too, so the first editor choice
can update immediately. Only omit the heading and its hook together when that copy is hidden.
The platform applies start/center/end text alignment only at desktop widths (1024px and above).
Template CSS may position only the heading group within its existing template-owned content
container and gutters. Preserve its readable width; never widen it to the viewport, remove the
gutters or move the whole hero copy block. A full-bleed image can stay full bleed independently.
Introductions, body copy, buttons, cards, images and donation widgets keep their placement and
alignment. Scope local group-placement rules to that template's heading hook, explicit active
values and the same desktop breakpoint; do not introduce global margins or a new layout setting.
Default and mobile keep the template layout. Start/end follow text direction, including RTL.
Keep field markers and text unchanged; validate every advertised value and visually check every
Look. Prove visible heading alignment and bounded group placement with readable width retained,
unchanged surrounding content, reset and mobile; computed text-align alone is not visual proof.
This capability needs a coordinated host/kit release; keep existing published dependency pins
until that supporting kit version is available.

## Bounded section presentation

The presentation.json registry defines platform-owned controls, value choices, reset addresses
and targets. It is published at https://developers.port60.com/schemas/template-presentation-v2.json
and documented at /reference/presentation/. Read the exact installed kit's registry for authoring;
the editor and a future agent must also check the exact selected template version's capabilities.
Do not infer support from a similar template, the catalogue's latest release or visible markup.

hero (About introduction) supports optional imageUrl and imageAlt only with the paired exact
section declaration supports.sectionFields:{"hero":["imageUrl","imageAlt"]}. This is independent
of layout choices: fixed compositions can support photographs without sectionLayout. Guard
missing images and preserve the original no-photo design. Use data-p60-field="imageUrl" only
on the actual img; escape imageAlt into alt, never an inline text marker. No placeholder,
invented photograph or borrowed Home hero photo is allowed. Unsafe or unsupported saved image
addresses stay stored but are omitted from rendering. The host accepts bounded root-relative
or HTTP(S) addresses, never credentials, whitespace, controls or backslashes.

Optional third field photoFraming in supports.sectionFields.hero offers fill/whole for the
Introduction photo, saved at section.content.photoFraming, never presentation.photoFraming.
Absent/reset inherits the author's composition, which may crop. Explicit whole shows the
uncropped natural image: width100%, heightauto, no blanket heightcap.
Keep data-p60-photo-framing="{{ section.photoFraming }}" on the actual marked img, empty when
inherited. Exact img token rules allow only object-fit:cover and aspect-ratio:1/1,4/3,3/2,16/9,2/1
for fill, or object-fit:contain and aspect-ratio:auto for whole. An optional root tag/classes
prefix and flat media/container conditions are allowed. Never change width, copy, grid, source,
alt or wrappers via framing. Prove actual crop vs natural whole in a browser with landscape,
portrait, square and panorama inputs; verify selector specificity does not mask the control.
The editor patches the existing image, then reconciles the section without refetching the photo
or navigating. Home hero framing and its default remain independent and unchanged.

sectionLayout is a per-section capability with image-start, image-end and stacked choices.
It is not a template-wide switch. Its hero target requires the independent photograph pair
above. The scaffold declares both; check the exact installed kit before authoring and do not
infer support from the registry alone. The layout proof preserves the natural root, unchanged
DOM order and separate frame/media/content roles.
Token CSS must be gated by data-p60-layout-has-media and may change only bounded grid tracks
and media/content grid-row/grid-column. No default token rule, arbitrary descendants, extra
containers, spacing, sizing, paint or platform islands. Start/end follow site direction.
Author opt-in needs exact default/reset equality, no-image safety and narrow single-column
browser evidence across every Look, plus long/cleared copy and repeated-section isolation.

headingScale and sectionSpacing are independent optional sectionPresentation controls. For example,
supports.sectionPresentation:{"homeHero":{"headingScale":{"options":["compact","standard","large"],"default":"standard"},"sectionSpacing":{"options":["compact","standard","spacious"],"default":"standard"}}}.
Every section key must appear in supports.sections. Declare only the two or three unique tokens
you have implemented, from compact/standard/large for headingScale, or compact/standard/spacious
for sectionSpacing; default must be one of those tokens. At least one control is required per
declared section; a spacing-only section does not need a heading. No raw CSS,
arbitrary numeric sizes, selectors or conditional expressions belong in this declaration.
The author defines a safe responsive size for each token in theme.css, not the editor or host.

imageOverlay is optional for homeHero only and requires supports.heroImagery:true. Declare
two or three choices from subtle/standard/strong and the inherited default. Save it at
section.content.presentation.imageOverlay; Liquid reads section.presentation.imageOverlay.
Keep data-p60-image-overlay on the existing first outer hero root, empty when inherited.
Mark photo-only wrappers data-p60-image-overlay-media and empty decorative overlay elements
data-p60-image-overlay-layer. Token CSS may change only palette-derived background,
background-image or background-color on marked layers, marked media ::before/::after, or
the documented .hero-slide-scrim beneath marked media. Never affect image opacity, filters,
geometry, copy, widgets or required text-readability scrims. Prove every static and carousel
branch, Fill and Whole, every Look, zero/one/two/max photos and no JavaScript. Default and reset
must match the original treatment; unsupported choices stay stored but do not render.
The inherited default can omit a CSS override; other choices need real matching layer rules.
Do not opt in a template whose branches cannot honour this. Starter deliberately remains
unsupported. Read /guides/sections-and-data/#bounded-photo-overlays for the full proof boundary.

colourTreatment is optional on non-island sections, excluding homeHero and impactMap. Declare
two or three unique standard/soft/contrast choices and an inherited default in sectionPresentation.
Persist only section.content.presentation.colourTreatment. Keep data-p60-colour-treatment on the
single natural outer root, empty when inherited. Mark authored descendants with
data-p60-colour-role="text|muted|accent|surface|border|link|button|secondary-button" (one role).
Nondefault token CSS must pair root background-color and color, cover every rendered role and
provide hover/focus-visible paint for link and button roles. Read existing Look palette variables;
never redefine global or section custom properties. Only color, background-color, border-color,
outline-color and text-decoration-color declarations are allowed; never use !important.
Do not alter geometry, images,
opacity, filters or islands. Never add padding/wrappers merely to make a colour control work.
Default-token CSS is forbidden so inheritance/default/reset keep the exact original design.
Use only flat natural root tag/classes + exact token, optionally followed by an owned role selector
and hover/focus-visible/active. No nested selectors or at-rules inside a token block.
Prove visible coordinated changes and contrast in every Look,
width, interaction and no-JavaScript state; structural CSS checks alone cannot prove that.
Read /guides/sections-and-data/#coordinated-section-colours for the full author contract.

For a colour-capable About introduction, render section.bodyHtml | colour_roles | raw on every
render, even inherited/default/reset. The v2 colour_roles filter decorates already-sanitised HTML:
h2/h3/h4=text, p/ul/ol/li=muted, a=link, blockquote=surface, hr=border. Cover every rendered role
and link hover/focus-visible. Inline emphasis inherits; images and islands are never decorated.
The filter only adds fixed attributes, preserving text, hrefs, markup and text-align. It is not
a sanitiser, never makes arbitrary HTML safe and does not bypass output escaping; raw stays explicit.
Do not conditionally replace or rewrap the body when changing a colour choice.

The saved address is section.content.presentation.headingScale. Inside Liquid the section variable
is already that content, so read section.presentation.headingScale. An absent key inherits your
existing CSS; reset removes it. Do not write a default into content or use a Liquid default filter.
An explicit choice equal to the default remains explicit. Unsupported saved choices stay stored
but are omitted from the render projection; switching templates must never erase them.

Keep data-p60-heading-scale="{{ section.presentation.headingScale }}" permanently on each actual
visible h1 to h6 section heading, including inherited headings without a field marker. The default
hook is empty, not absent. Hidden headings may omit both the heading and hook. Never put this
hook on a heading group, eyebrow, introduction, card title, action or platform island.
Write token-specific font-size rules scoped to this hook and the relevant heading family.
The declared default must have the same computed size as inheritance at each supported width
and Look. Do not change copy, heading levels or unrelated markup in response to the token.

For spacing, save section.content.presentation.sectionSpacing and read section.presentation.sectionSpacing
in Liquid. Keep data-p60-section-spacing="{{ section.presentation.sectionSpacing }}" permanently on
the natural outer section root, with an empty inherited hook, even when its heading is hidden.
Never add a wrapper or put the hook on an inner container, heading, card or platform island.
Token-specific CSS must target only that root and change only padding-block, padding-block-start,
padding-block-end, padding-top or padding-bottom. Never use padding shorthand or change horizontal
gutters, gaps, height, typography, descendants, pseudo-elements or island internals. Keep asymmetric
top/bottom authored padding intact in the default. The declared default must compute identically
to inheritance across widths and Looks. Omit spacing when the existing root has no suitable padding.
Multiple outer roots, including ancillary behaviour siblings, are unsupported; preserve them and
omit spacing rather than adding a wrapper. If clearing copy already omits the entire section,
all spacing choices must preserve that omission, never create a section in response to the token.

Kit preview, live preview and final rendering use the same accepted-value projection. The kit
checks declarations, heading/root hooks, structural isolation and token-specific CSS declarations;
it cannot prove computed CSS or visual quality. Check every option and reset in a browser across
Looks, narrow/wide viewports, long/empty/inherited headings, repeated sections and no JavaScript.
Prove visible size and spacing changes without overflow or changing unrelated layout. Respect reduced motion.
Existing headingAlignment and showCollectionLink addresses are unchanged. This is a bounded
presentation registry, not an arbitrary schema-driven editor or condition language.
Ship the compatible host and kit before publishing newly versioned template declarations.

The kit scaffold implements both controls on homeHero, hero, values and cta using its existing
heading families and natural root padding. people, campaigns and impactMap remain excluded:
their current utility or island roots have no suitable authored spacing surface. Preserve
the whole-photo hero's zero top padding and the form variant's distinct bottom padding.

Declare supports.fieldMarkers:true when showing authored field markers. A marker such as
data-p60-field="title" or data-p60-field="items.{{ forloop.index0 }}.label" addresses only that
section's content. Its node must contain exactly the authored value. Use a span when punctuation
or generated text surrounds it. Never mark source records, generated labels or resolved actions.

## Shared inspectors and section starting arrangements

An implemented v2 settings.schema entry may use group:"header" or group:"footer" with
supports.layout:true to appear in the matching shared website inspector. Historical v1 groups
and artifacts remain unchanged. This is explicit exact-artifact metadata, not a guessed
meaning of a key or template name. Existing color/select/toggle/font kinds, saved theme keys,
body data-p60s-<key> attributes and --p60s-<key> variables are unchanged. Implement every option
in the template's own CSS/markup; grouping alone does not create or prove a visual effect.
Author bounded artwork sizes per design, not universal ranges; leave unsupported placements
and choices absent.
Logo sizing affects artwork, not unrelated type. Keep useful no-logo and empty-social states,
menu destinations, identity, required legal links, consent and transactions. Verify every Look,
responsive width, keyboard and no-JavaScript state, plus exact inherited/default/reset equality.

Header/Footer controls share the existing theme working copy. Reset removes only the named
override; Design bulk reset preserves shared groups and unsupported saved choices. Explicit
defaults/false/blanks remain resettable. Looks still apply only their declared keys once.
Brand and menu controls retain their existing source records and website draft/publication flow.
Social addresses remain in Website settings with their own permissions and save lifecycle;
presentation choices never create or delete addresses or automatically save their source.

The visual Add section chooser uses exact supports.sections, allowed page types, compositions
and the existing per-section sectionLayout declarations. Its diagrams are schematic guides,
never screenshots or tenant content. There is no arbitrary presets schema or nested-container
model. Add inserts one new stable-key section with empty content or only the chosen layout
preference. Cancel has no effect; existing sections stay untouched. Template default omits the
override. Do not seed sample text, images, statistics, action links or source records. A layout
choice does not add a photograph, create an empty media column or change mobile ownership.

V2 impactMap requires explicit section.mapSlug. Missing/null/blank means no selected map;
never substitute the first public map. Unavailable, unpublished or archived selected maps have
no replacement fallback. Historical v1/built-in default-map behaviour is unchanged. The v2 kit
preview only shows its non-interactive map fixture when the selected slug matches that fixture:
canonical sample mapSlug:"our-work" matches impactMap.slug:"our-work"; minimal stays empty.
Custom demos must also explicitly select their matching fixture, never fetch tenant records.

Connected source choices are bounded typed references, not duplicate content or free expressions.
Map title/description/points stay in Maps; local introduction copy is only for templates that
actually render it. Cause buttons retain causeId and the public address copied when chosen,
not a live link expression following future slug changes. Missing sources keep saved choices
and show a notice; never choose replacements or create source records to fill a layout.
Use the compatible platform and kit before releasing newly versioned declarations. Source
tests, browser acceptance, local deployment and remote release are separate gates.

## Navigation and actions

Optional supports.navigationModes is {options:["simple","mega"],default:"mega"} (either supported
mode may be the default). It requires supports.layout and both working presentations. Mark the
header navigation root data-p60-navigation-mode="{{ site.nav.headerMode }}". The host resolves the
saved choice or declared default; missing capability keeps the historical layout. Do not infer
support from navigationHighlights. Both modes retain supplied destinations, node order and saved
metadata. Scope mode CSS to that marker and verify mobile, keyboard and no-JavaScript navigation.

site.nav.header and site.nav.footer are independent arrays. kind link has href; kind group has
null href and children. Use disclosure controls for groups, not fake links. Render two child
levels and preserve description, imageUrl and optional megaMenu.promo. No derived menus, CTA
flags or generated columns exist. The template owns responsive menu layout.
supports.navigationHighlights:true must render supplied promos, including text-only cards,
without losing normal links. The nav behaviour alone never enables this feature.
site.actions.header and site.actions.hero are resolved actions or null. site.actions.widget is
donate, volunteer or none. Do not infer actions from navigation. Authored hero override text
retains its field marker; resolved fallback actions do not.

Optional supports.sectionCollectionLinkVisibility lists supported collection section types with
an existing onward link. Mark only that anchor data-p60-collection-link, keep its supplied href
and existing label, and add hidden only when section.showCollectionLink == false. Missing/true
keeps the default link. Keep the hidden anchor for immediate editor updates; omit it only when
there is no supplied destination. Do not hide headings, cards or individual record links, invent
URLs, or add text/position controls. Unsupported saved preferences are retained but not rendered.
Both presentation capabilities need a coordinated host/kit release, not a speculative registry pin.

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
  Declare supports.heroImagery:true plus supports.heroImageLimit as an integer from 1 to 6
  matching the homeHero's actual capacity. Missing limit means one photograph; no hero imagery
  means zero. A limit above one must render every distinct photograph in a fixture of that
  size or place the hero_carousel island. A generic carousel declaration is not proof.
  The editor reads the exact selected template version, never the catalogue's latest version.
  Saved photographs are never truncated on template switches. Publish a new immutable version
  with this declaration only after the matching host and kit release; preserve existing pins.
- Preserve settings and Looks. Use platform fonts and declared CSS tokens.
- The host owns lang/dir and Arabic fonts. Use logical CSS properties. Read site.locale.code.
- Do not add a visitor language selector. site.locale.languages is currently empty and the
  legacy language_switch slot renders nothing. Interface catalogues are not translated tenant content.
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
