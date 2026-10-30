# HUMANS.md

Run and use `react-render-audit`. Internals: [AGENTS.md](AGENTS.md).

## Quick start

```bash
bun add @rethunk/react-render-audit
```

```ts
import { chromium } from '@playwright/test'
import { hookScript, layoutBreaks, Meter, muiPreset, unevenSpacing } from '@rethunk/react-render-audit'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.addInitScript({ content: hookScript({ ignoreCommitsOf: [...muiPreset.ignoreCommitsOf] }) })
await page.goto('http://localhost:5173')

const meter = new Meter(page, await page.context().newCDPSession(page), {
  libraryNames: muiPreset.libraryNames,
})
await meter.reset()
await page.getByRole('button', { name: 'Save' }).click()
await meter.untilStill(300, 5000)
console.log(await meter.read(), await layoutBreaks(page), await unevenSpacing(page, muiPreset))
await browser.close()
```

## Contracts

| Entry point | Contract |
| --- | --- |
| `hookScript(options?)` | A script to install with `addInitScript` before the page loads. Counters are read from `window[global]`, `__renderAudit` by default. A commit caused only by a component in `ignoreCommitsOf` does not count as the page changing. Periodic timers at or above `quietIntervalsFromMs` run a no-op. |
| `new Meter(page, cdp, options?)` | `reset`, then act, then `untilStill` and `read`. Backend calls are counted only when `backendCall` returns a name for the request. `read` throws if the hook script was not installed. |
| `perTen(sample, watchedMs)` | Scales the counts of an idle watch to per 10 s. |
| `layoutBreaks(page)` | `collapsed`, `covered` and `overflow` together; each is an exported function that runs in the page. |
| `unevenSpacing(page, options?)`, `nestedBoxes(page, options?)` | Selectors come from the options; with none, nothing library-specific is assumed. |
| `muiPreset` | The MUI values for the options above, `libraryNames` for `Meter`. |
| `diffShots(oldDir, newDir)` | Writes `<newDir>/diff/<screen>.png` for each screen that changed; reports, never judges. `render-diff OLD NEW` is the same as a command. |
| `webkitWalk(walk)` | Returns structured breaks, or `null` when the driver or browser binary is missing. A step that finds nothing to click is a `missing` break. It needs WebKitGTK, WebKitWebDriver and a display; the caller supplies the driver's environment. |

## Requirements

ES modules, read by a bundler or a runtime such as Bun or Node. Peer dependencies: `@playwright/test` ^1.64.0. Developing the package takes `bun`, plus `lefthook`, `gitleaks` and `gate` on PATH if
you want the git hooks.

```bash
bun install
lefthook install
```

That is per clone; git does not commit hooks. Pre-commit scans staged changes for secrets, and
pre-push runs `gate`.

## Verify

```bash
gate
```
