# Security

## Supported versions

The latest tagged release. There are no long-lived release branches, so a fix ships in the next tag
rather than being backported.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on this repository (Security → Report a
vulnerability). It stays private until a fix ships.

Please do not open a public issue for a suspected vulnerability first.

## What is in scope

- `diffShots` reads PNG files from two folders and decodes them in a headless browser. A crafted
  image must not run code or write outside `<newDir>/diff`.

## What is out of scope

- The page under test: its scripts run in the browser Playwright drives, as they would anyway.
- The environment and binary paths handed to `webkitWalk`.
