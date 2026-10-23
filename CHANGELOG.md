# Changelog

## 1.6.1

### Changed

- `p60-template-kit login` opens the sign-in page only when the address the platform returned is
  `https:`, and never through a shell: on Windows it hands the address to `rundll32
  url.dll,FileProtocolHandler` as one argument, elsewhere to `open` or `xdg-open`. Any other
  address is left as the printed link.
- `p60-template-kit dev` listens on 127.0.0.1 unless `--host` says otherwise (`--host 0.0.0.0`
  opens the preview to the network, for a look on a phone), and says so when it is not the
  loopback address. A bare `--host`, or `--host=address`, stops with a hint instead of binding
  loopback in silence.

### Compatibility and release

No contract change: templates validate and preview as before. A developer who relied on the
preview being reachable from another device passes `--host 0.0.0.0`. Publish through the mirror's
GitHub Release workflow after the matching platform release (multi-tenant-services #351, the
2026-10-18 audit's L-01 and L-04) is live.

## 1.6.0

### Changed

- The validator refuses a closing style tag in any `.css` entry. The platform inlines
  `assets/theme.css` into the page's style element, so a `</style` in the theme would end that
  element and whatever followed would be parsed as markup. The upload intake refuses the same.
- The inline event handler check treats a slash or a quote before `on*=` as an attribute
  boundary, as the HTML parser does, so `<img src="x"/onerror=...>` and `<img src="x"onerror=...>`
  are refused like `<img src="x" onerror=...>`.
- The preview renderers inline the theme through `inertInlineCss`
  (`src/vendor/engine/inline-style.mjs`), which escapes `</` as `<\/`: no change to the meaning
  of valid CSS, and a theme can never close the element it is inlined into, in a preview or on
  the platform.

### Compatibility and release

Stricter validation only: a template whose theme carries no closing style tag and whose markup
places no event handler attribute is unaffected, and every Port60 template validates unchanged.
Publish through the mirror's GitHub Release workflow after the matching platform release
(multi-tenant-services #343, the 2026-10-18 audit's H-04) is live.

## 1.5.0

### Added

- The `form` section: a placement (Home and About) that names a form the organisation built
  in Forms through the Pages editor. The section stores `formId`, `formInstanceId` and
  `formSlug`; the `form` island renders the instance the slug addresses with the respondent
  fields, the questions, the privacy line and the submit. The island's styling API is the
  renderer's `p60-form-*` classes. The validator accepts the section or the island for the
  `forms` capability; the preview renders the form fixture only for a matching `formSlug`.
- The starter ships `sections/form.liquid` and declares the section and the island.
- Content bounds record the 200-character plain-text biography limit on People sections.

### Fixed

- The starter renders complete biographies with line breaks and wrapping instead of italics.
- Authored output escaping replaces NUL characters so a stored control character cannot
  reach a rendered page.

### Compatibility and release

Additive: the section catalogue, manifest schema (`sectionPresentation` and
`sectionHeadingAlignment` accept `form`, at most 17 entries) and the `form` island entry grow;
nothing existing changes. Templates that do not ship `sections/form.liquid` are unaffected: the
editor marks a placed form section not visible and the public page skips it. Publish through
the mirror's GitHub Release workflow after the matching platform release
(multi-tenant-services #329) is live.

## 1.4.1

### Fixed

- Shared preview styles follow the platform's accessible event heading hierarchy,
  donation confirmation headings and course sign-in spacing.
- Footer and impact-map copy retain their theme's intended contrast. Map location
  controls match the platform's keyboard-accessible selector instead of interactive dots.
- Plain-text biographies preserve line breaks and wrap long content without forced italics.

### Compatibility and release

This patch changes preview styling only. It does not change the template contract or
require template dependency updates from 1.4.0. Publish through the mirror's existing
GitHub Release workflow after the matching platform changes have been merged and deployed.

## 1.4.0

### Added

- Template-authored navigation subsets with two to four supported styles: Dropdown,
  Side-opening, Wide dropdown and Menu panel. The exact template version owns the choices
  and default; every presentation preserves the same navigation tree and destinations.
- Shared cascading-menu placement, viewport-edge reversal in both directions, tall-menu
  scrolling and state-aware disclosure hints. Templates still contain no JavaScript.

### Fixed

- Closed-panel measurement preserves authored grid/flex layouts and transitions, including
  collapsed-height, transformed and wrapper-hidden panels.
- Stable nested pointer travel, fast root hover switching, form-control keyboard ownership,
  cached geometry and scroll preservation match the deployed platform runtime.
- Failed renders no longer produce misleading additional navigation-distinctness errors.
- Preview fallback-page headings carry the deployed platform's page-title hook, so template
  title scales remain consistent outside authored Home and About sections.

### Compatibility and release

Requires the compatible platform from `Port60Labs/multi-tenant-services` PR 305 before
templates opt into the new modes. Existing two-mode artifacts and v1 contracts remain
supported. Publish through this mirror's GitHub Release workflow, then update first-party
template pins and run their normal registry-only gates before merging templates PR 24.

## 1.3.0

### Added

- Author-bounded per-section heading size, spacing, image overlays, coordinated colour
  treatments and layout variants, with explicit inherited defaults and validation.
- Optional About introduction photographs, independently declared field support and authored
  framing. The starter demonstrates supported layouts without inventing content.
- Shared Header/Footer setting groups and matching author guidance, using existing Brand,
  navigation and social records rather than parallel content.

### Fixed

- Preview lifecycle and selected-carousel state match the compatible platform runtime.
- V2 preview maps require the selected map rather than silently choosing a different record.
- The lockfile pins patched fast-uri 3.1.8. Published v1 contracts remain unchanged.

### Compatibility and release

Requires the compatible platform changes in `Port60Labs/multi-tenant-services` PR 281 before
templates opt into these declarations. This is not arbitrary CSS, nested page building or an
agent-assisted editing launch. Publish through this mirror's GitHub Release workflow only,
then validate first-party templates with the registry package before their release.

## 1.1.0

### Added

- V2-only `t` interface translations and deterministic `local_date` formatting, mirrored
  from the compatible platform host. The v1 dialect remains frozen.
- Optional stable prayer `key` values in the content model, independent of translated labels.

### Fixed

- Shared mobile island breakouts use logical offsets in both text directions.
- Generated README, AGENTS.md and CLAUDE.md identify the generating kit version rather
  than hard-coding 1.0.0. Fresh package dependencies already use that version.

### Compatibility and release

Deploy the platform changes from `Port60Labs/multi-tenant-services` PR 219 before uploading
templates that use the new filters. Full Arabic live-island and legal-copy acceptance remain
outside this release; the filters do not change tenant-authored content or prayer wall-clock times.

The owner merges the kit PR and publishes GitHub Release `v1.1.0` from that merged commit.
The existing trusted npm publication workflow performs the release. Verify registry version
and integrity before updating first-party package/lockfile pins or merging templates PR 13.
Local tarball tests are prerelease evidence, not proof that 1.1.0 is available on npm.
