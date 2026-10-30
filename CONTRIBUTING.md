# Contributing

Read [`AGENTS.md`](AGENTS.md) first.

## Commits

`type(scope): subject` — imperative, about 72 characters, one logical unit, why in the body, no AI
trailers.

## Gate

```bash
gate
```

`gate` is what the CI gate job runs.

## Exports

The module has one consumer. A new export needs a call site there, not a use for it here.
Tests sit beside the code and import it by relative path, so they are not a reason to export
anything from `src/index.ts`.

## Dependencies

A new dependency needs a reason the platform cannot meet. React, React DOM and anything else the
consumer must share one copy of are peer dependencies, never dependencies.

## Changelog

[`CHANGELOG.md`](CHANGELOG.md): Keep a Changelog, newest first. Add to Unreleased in the same commit
as a behaviour change. Refactors, tests and docs do not.

Cut a release by setting `package.json` `version`, committing, and tagging `vX.Y.Z`; the tag
workflow publishes it.
