# Changelog

Notable changes to `react-render-audit`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-11-23

### Added

- `render-shot` and `render-shotdiff` commands, with `renderShots`, `compareShots`, `chromiumBin` and `ShotError` as library exports: render a page or file headless at given sizes, and compare a render to a design mock (percent differing after fuzz, largest regions, side-by-side crop). They need a Chromium binary and ImageMagick.

## [0.4.0] - 2026-11-21

### Added

- `Step.prefix` matches a label that starts with the step's name, for a control whose label carries a count or the open item's name, which 0.3.0's literal match could not reach.

## [0.3.0] - 2026-11-21

### Added

- `ShotDiff.failed`: the screens both folders have that `diffShots` could not compare, because a file is not a readable PNG.

### Fixed

- `diffShots` keeps comparing when one screenshot is corrupt; the bad screen lands in `failed` instead of ending the run.
- `webkitWalk` writes a screenshot only when the driver answers PNG bytes within a size cap, and only under a name that stays inside the shots folder, so whatever answers on the driver's port cannot choose what lands on disk.
- `webkitWalk` matches accessible names literally, bounds its driver I/O, and fails the walk when the driver binary cannot start.
- `webkitWalk` names the driver's status when it answers with something that is not an object, and skips layout checks after a step that missed its target.
- `Meter` enables the Performance domain, scales `perTen` correctly, rejects a non-positive `watchedMs`, and ignores the `g` and `y` flags on regexes.
- `hookScript` counts mutations when the script runs after the document loaded, and rejects a non-finite quiet time.
- `unevenSpacing` skips elements whose painted walk hits the node cap, and invisible overlays no longer trip the layout checks (MUI library names are anchored too).
- `render-diff` exits 2 when it is given a file instead of a folder.
- `proc` skips non-numeric names under `/proc` when it walks a process tree.

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

[Unreleased]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Rethunk-Tech/react-render-audit/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Rethunk-Tech/react-render-audit/releases/tag/v0.1.1
[0.1.0]: https://www.npmjs.com/package/@rethunk/react-render-audit/v/0.1.0
