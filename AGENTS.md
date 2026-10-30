# AGENTS.md

<!-- scaffold: two or three sentences: what `@rethunk/react-render-audit` does, who imports it, and what it never
imports (no consumer package). -->

## Gate

`gate` is the command; each check in `.gate.toml` is a `package.json` script, so a contributor, the
pre-push hook and CI run the same thing. The `build` gate emits `dist` and then checks what `npm pack`
would upload.

## Shape

- Relative imports keep their `.ts` extension; `tsc -p tsconfig.build.json` rewrites it to `.js` on emit.
- `package.json` `files` is `dist` and `src`: the declaration maps point at `../src`.
- The only entry point is `src/index.ts`; a name not exported there is not API.
<!-- scaffold: the invariants a change must keep, each with its reason: what stays unexported and
why, which function is the single path for what, which bound is policy and which is not. -->

## Files

<!-- scaffold: a `| File | Holds |` table, one row per non-test source file. -->
