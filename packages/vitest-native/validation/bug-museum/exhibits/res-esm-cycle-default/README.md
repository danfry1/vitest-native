# A default import read during an import cycle must stay live

- **Class:** transform/resolution
- **Source:** #339 adversarial review (a regression of #339's eager interop)
- **Fixed by:** open (regression guard for #339)
- **Needs:** nothing beyond this repository's install
- **Bug build:** `origin/fix/esm-goal-import-interop` (has the bug; see STATUS.md)

## The bug

TypeScript's CommonJS output sets `exports.default` AFTER its requires. In a cycle, an ES module default-importing such a file is evaluated while the file is half-initialised (`__esModule` set, no `default` yet). Babel's interop reads `.default` at use time, so it is right; #339's eager decision (no own `default` now, so use `module.exports`) is wrong forever after.

## Expected behaviour

The default import, used after the cycle settles, is the module's `default` function.
