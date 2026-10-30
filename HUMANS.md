# HUMANS.md

Run and use `react-render-audit`. Internals: [AGENTS.md](AGENTS.md).

## Quick start

```bash
bun add @rethunk/react-render-audit
```

<!-- scaffold: the smallest complete TypeScript example of the main entry point, type-checked
against the real API: imports shown, errors handled. -->

## Contracts

<!-- scaffold: a two-column table, one row per exported entry point or behaviour a caller depends
on: what it refuses, what it guarantees on failure, what it never does. -->

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
