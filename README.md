<h1 align="center">react-render-audit</h1>

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@rethunk/react-render-audit.svg)](https://www.npmjs.com/package/@rethunk/react-render-audit)
[![TypeScript](https://img.shields.io/badge/TypeScript-typed-3178C6?logo=typescript&logoColor=white)](tsconfig.json)

</div>

---

Playwright helpers that measure what a React page does: commits per component and why, idle activity, backend-call counts, layout breaks, and a pixel diff of two screenshot folders. Package `@rethunk/react-render-audit`. First consumer: Mortar.

It reads React's DevTools hook, so it counts commits by component without a dev build, and its layout checks need
no baseline to see a bug. Selectors for a UI library are options; `muiPreset` holds the values that fit MUI.

```ts
await page.addInitScript({ content: hookScript(muiPreset) })
```

## Quick start

```bash
bun add @rethunk/react-render-audit
```

A worked example and the contracts: [HUMANS.md](HUMANS.md).

## Features

- `hookScript` and `Meter` report commits per component and why, mutations, long tasks and backend calls.
- `layoutBreaks` finds a control squeezed to nothing, text covered by another element and a page wider than its window.
  A positioned `<aside>` laid over content is taken as a side panel meant to cover it, and a menu or dialog kept
  mounted while hidden is not taken as the open layer.
- `unevenSpacing` and `nestedBoxes` find uneven gaps and a box inside a same-looking box.
- `diffShots` and the `render-diff` command compare two screenshot folders pixel by pixel.
- `webkitWalk` repeats the layout checks in WebKitGTK through WebKitWebDriver.
- `@rethunk/react-render-audit/proc` reads a process tree's memory and CPU from Linux `/proc`, for budget scripts.

## Documentation

| Doc                                | Audience                       |
| ---------------------------------- | ------------------------------ |
| [HUMANS.md](HUMANS.md)             | Running and using the package  |
| [AGENTS.md](AGENTS.md)             | Internals, invariants, and why |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Process — commits, tests, docs |
| [SECURITY.md](SECURITY.md)         | Vulnerability disclosure       |
| [CHANGELOG.md](CHANGELOG.md)       | Release notes                  |

## License

MIT — see [LICENSE](LICENSE). © 2026 Rethunk.Tech, LLC.
