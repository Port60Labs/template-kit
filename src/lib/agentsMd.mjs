// The scaffold's AI-agent briefing (T3, user requirement: the kit must let people put an AI
// engine on template work and be productive immediately). Written for ANY coding agent —
// AGENTS.md is the cross-tool convention and CLAUDE.md carries the identical content for tools
// that read that name. The briefing is the contract's rules + the iteration loop, so an agent's
// first move is always the same: read this, edit, validate --json, repeat until clean.

export function agentsMd(name) {
  return `# Working on the "${name}" Port60 template

You are working on a **Port60 site template** — a small, versioned artifact of Liquid renderers
and CSS that a charity's site is rendered through. It contains **no application code**: no
JavaScript, no API calls, no payment logic. Templates decide how a site *looks*; the platform
owns what it *does*.

## The iteration loop (use this constantly)

\`\`\`bash
npm run validate          # human-readable conformance check
npm run validate:json     # machine-readable: {ok, errors[], warnings[], provenSupports}
npm run dev               # local preview at http://localhost:4400 (re-renders on refresh)
npm run package           # validate + produce the uploadable <name>-<version>.zip
\`\`\`

**After every meaningful edit, run \`npm run validate:json\` and fix every error before moving
on.** The validator is the exact code the platform runs at upload — if it passes here, the
platform accepts it; if it fails here, the upload will fail identically.

## The file layout (nothing else is accepted)

- \`manifest.json\` — identity + what you support. \`name\` and \`version\` are immutable
  identity; bump \`version\` (semver) for every published change.
- \`layout.liquid\` — the page chrome (header/nav/footer). Must contain **exactly one**
  \`{% content %}\` slot. Only needed when \`supports.layout\` is true.
- \`sections/<type>.liquid\` — one renderer per section type you declare in
  \`supports.sections\`. Charities compose pages from a **closed catalogue** of section types
  (see \`npm run validate\` output or the docs) — you cannot invent new types.
- \`pages/<page>.liquid\` — optional full-page templates for \`supports.pageTemplates\`.
- \`assets/theme.css\` — required, your entire look. More \`.css\` files under \`assets/\` are
  allowed. **No images, no JS** — they are refused at upload.

## The rules the validator enforces (do not fight them)

1. **Escape-by-default.** Every output is HTML-escaped unless you use \`| raw\` — and the only
   values you may pass through raw are the contract's sanitised richtext fields.
2. **The dialect is a whitelist.** \`{% include %}\`, \`{% render %}\`, \`{% layout %}\` and
   several other tags are excluded and fail at parse. Unknown filters throw.
3. **Islands are placed, never implemented.** Live functionality (donations, sign-in, events) is
   \`{% island 'donation_widget' %}\` etc. Every island you place must be declared in
   \`supports.islands\` and exist in the platform registry. Style them via their stable class
   API; never reimplement them.
4. **Declared ⇒ rendered, rendered ⇒ declared.** Supports flags are PROVEN behaviourally: if you
   declare \`supports.worship\` the layout must actually render the worship fixture's times, must
   hide the rail when \`worship\` is null, and rendering it undeclared is equally an error. The
   same honesty applies across the contract.
5. **Render budgets are real.** Runaway loops are killed (~1s per render). Keep renderers simple.
6. **Context is a whitelist.** Sections see \`{section, brand}\` plus only the collection named by
   that section in the contract; layouts see \`{brand, nav, socials, worship, locale}\`; page
   templates see their documented fixture + \`brand\`. Nothing else exists — do not invent
   variables.
7. **Capabilities are matching metadata, never entitlements.** Every value in
   \`requiresCapabilities\` must have a declared section, page template or island that presents it.
   \`suitsProfiles\` describes design intent and changes catalogue ordering only.

## What each declaration owns

- \`supports.layout\` owns the visible header, navigation and footer around platform pages. The
  platform still owns the document head, consent and identity.
- \`supports.pages\` owns section based bodies for \`home\` and \`about\` through the declared
  renderers in \`sections/\`.
- \`supports.pageTemplates: ["events"]\` owns the events listing only. Event details, RSVP and
  ticket purchase remain platform owned.
- \`supports.pageTemplates: ["course"]\` owns a course detail presentation only. The course
  listing stays platform owned and enrolment remains the \`course_enrol\` island.
- \`supports.pageTemplates: ["articles"]\` owns the article front page and archive listings.
- \`supports.pageTemplates: ["article"]\` owns article detail presentation; engagement and
  comments stay the \`article_engagement\` and \`article_comments\` islands.
- Other platform routes keep their platform body and render inside your layout. Capability flags
  expose documented optional context; they do not transfer transaction or route ownership.

## What to build with

- Theme via CSS custom properties and the settings knobs you declare in
  \`manifest.settings.schema\` — they surface in the charity's Appearance editor as
  \`--p60s-<key>\` variables and \`data-p60s-<key>\` body attributes.
- Hero photographs (\`homeHero.images\`, when you declare \`supports.heroImagery\`): render one
  photo directly as a TREATED backdrop (a scrim/tint built from your own palette variables via
  color-mix — never raw), place the \`hero_carousel\` island for two or more (style its
  \`.hero-slide-scrim\`), and design the no-photo state as a gradient/colour — never a
  placeholder. The starter's \`.lq-homehero\` is the reference; the validator checks all of this
  behaviourally.
- "Looks" = named one-click bundles of knob values in \`manifest.looks\`.
- Fonts: only families from the platform font catalogue, declared with the weights you use.
- Navigation can contain two levels below a top item. Render every supplied child and branch on
  optional \`group\`, \`description\`, \`imageUrl\` and \`megaMenu\` promo metadata. Never hardcode
  menu groups that are not in \`nav\`.
- Dynamic sections include appeals (\`causes\`), programmes (\`services\`), resources, locations,
  volunteering opportunities and structured media. Derive or omit when a collection is empty and
  use the supplied URLs rather than constructing routes.
- Submission and behaviour surfaces such as \`newsletter_signup\`, \`volunteer_signup\`, \`form\`,
  \`search\`, \`language_switch\` and \`next_prayer\` are platform islands. Place and style them;
  never reproduce their API calls or consent behaviour.
- \`manifest.imagery.hero\` (optional but recommended): declare the photo shape YOUR hero
  composes best with (\`idealAspect\`, \`minWidth\`, a one-line \`note\`) — the charity's editor
  measures their actual upload against it and advises. Advice, never enforcement.

## Which contract this is

The section catalogue, islands and fixtures here are the **Charity Platform contract v1** — the
platform's first product surface. The dialect, the rules above and this toolchain are
platform-wide; other Port60 products will ship their own contract packs. Do not assume the
current section list is universal.

## Reference

The full generated reference (sections, islands, context variables, tokens, dialect) lives at
https://developers.port60.com — also available in one file for agents at
https://developers.port60.com/llms-full.txt
`;
}
