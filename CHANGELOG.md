# Changelog

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
