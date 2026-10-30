# AGENTS.md

`@rethunk/react-render-audit` measures a running React page from Playwright. It imports only
`@playwright/test` (a peer) and Node built-ins and names no UI library: library selectors arrive as
options, with `muiPreset` as one ready set.

## Gate

`gate` is the command; each check in `.gate.toml` is a `package.json` script, so a contributor, the
pre-push hook and CI run the same thing. The `build` gate emits `dist` and then checks what `npm pack`
would upload.

## Shape

- Relative imports keep their `.ts` extension; `tsc -p tsconfig.build.json` rewrites it to `.js` on emit.
- `package.json` `files` is `dist` and `src`: the declaration maps point at `../src`.
- The only entry point is `src/index.ts`; a name not exported there is not API.
- `src/page/` holds functions Playwright serializes into the page: they may not close over module
  scope, which is why they carry their own helpers and regexes.
- `hookScript` is one template string evaluated in the page; every value it varies by is
  `JSON.stringify`d into it, never concatenated raw.
- The hook counts a component when React did work on it in a commit, so the counts hold for
  production builds.
- Nothing here reads an environment variable or writes to the console; callers pass options and
  `Meter` takes a `log` callback.
- `webkitWalk` has no automated test (it needs WebKitGTK and a display); keep its logic in the
  page-side scripts and the break shaping small.

## Files

| File | Holds |
| --- | --- |
| `src/index.ts` | The public surface |
| `src/hook.ts` | The DevTools hook script |
| `src/meter.ts` | `Meter`, `Sample`, `perTen` |
| `src/preset.ts` | `muiPreset` |
| `src/diff.ts`, `src/cli.ts` | Screenshot folder diff and its command |
| `src/walk.ts` | WebKitGTK walk through WebKitWebDriver |
| `src/page/layout.ts`, `gaps.ts`, `boxes.ts`, `pixels.ts` | Page-side checks and pixel compare |
