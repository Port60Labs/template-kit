# Changelog

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
