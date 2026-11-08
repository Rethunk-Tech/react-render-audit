# Changelog

Notable changes to `react-render-audit`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-08

### Added

- `@rethunk/react-render-audit/proc`: memory and CPU of a process tree from Linux `/proc` — `tree`, `pssKiB`,
  `cpuSeconds`, `mappings`, `byRole`, `browserRoot`, `exeOf` and `roleOf` — for budget scripts. Linux only.

## [0.1.3] - 2026-11-07

### Fixed

- `layoutBreaks` checked only a hidden menu when a page kept a closed menu or dialog mounted, so the rest of the page
  went unchecked; it now takes only a shown layer as the one on top

### Changed

- Text under a positioned `<aside>` (a side panel laid over a list on purpose) is no longer reported as covered

## [0.1.2] - 2026-11-01

### Fixed

- `webkitWalk` starts WebKitWebDriver on a free port unless given one, and stops it and its browser when the process
  is interrupted, so a later walk is never refused a session by a driver an earlier one left running

## [0.1.1] - 2026-10-30

### Changed

- The published package leaves out the test files.

## [0.1.0] - 2026-10-30

### Added

- `hookScript` and `Meter`: React commits per component and why, backend calls and idle activity.
- `layoutBreaks`, `unevenSpacing`, `nestedBoxes`: layout checks that need no baseline.
- `diffShots` and the `render-diff` command: pixel diff of two screenshot folders.
- `webkitWalk`: the layout checks in WebKitGTK.
- `muiPreset`: selectors and names for MUI apps.

[Unreleased]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Rethunk-Tech/react-render-audit/releases/tag/v0.1.1
[0.1.0]: https://www.npmjs.com/package/@rethunk/react-render-audit/v/0.1.0
