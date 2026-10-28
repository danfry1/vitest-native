# A default import of a Proxy-served CommonJS module must read its trap

- **Class:** transform/resolution
- **Source:** #339 adversarial review (a regression of #339's eager interop)
- **Fixed by:** open (regression guard for #339)
- **Needs:** nothing beyond this repository's install
- **Bug build:** `origin/fix/esm-goal-import-interop` (has the bug; see STATUS.md)

## The bug

Preset modules and some libraries serve CommonJS exports from a Proxy whose `get` trap answers `__esModule` and `default`. #339's eager interop tests `hasOwnProperty('default')`, which a trap does not answer, and so hands the importer the Proxy itself instead of its `default`.

## Expected behaviour

The default import is what the Proxy serves as `default`.
