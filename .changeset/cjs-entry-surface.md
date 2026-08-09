---
"vitest-native": minor
---

Make every declared entry point loadable, and require Node >= 20.19

`require("vitest-native")` threw. The package's `main`, the `require` condition of the
root export, and the `require` conditions of `./setup` and `./presets` all pointed at
transpiled CommonJS bundles that could not be loaded at all: the root re-exports the
presets, every preset imports `vi` from vitest at module scope, and vitest throws when
it is reached through `require()`. A previous release gated this and recorded the three
entries as known-unloadable rather than fixing them.

The fix is not to change how the presets are written. Node has loaded ES modules from
`require()` since 20.19, and the ESM build was always fine — only the transpiled
CommonJS build tripped vitest's guard. Those three subpaths now declare a single ESM
target for both conditions, and the dead CommonJS bundles are no longer emitted.
`const { reactNative, presets } = require("vitest-native")` works, on both the oldest
and newest supported Node. No documented API changed.

`engines` now requires Node >= 20.19.0, the version that added `require(esm)` and the
oldest version the matrix has ever tested. The previous `>= 20` advertised support for
Node 20.0–20.18, which was never exercised and where the root entry cannot be required.

Two gates were extended to keep this fixed:

- `tests/package-exports.test.ts` resolves and loads every subpath by specifier under
  both `require` and `import`, rather than only loading declared targets by path. The
  original defect was invisible from the path side, since `dist/index.mjs` loaded fine
  throughout.
- `scripts/check-exports.mjs` no longer ignores `cjs-resolves-to-esm` package-wide.
  Subpaths that are ESM-only on purpose are declared explicitly and checked against the
  manifest in both directions; every other subpath is checked with the rule enforced, so
  a dual entry cannot quietly lose its CommonJS build. Deriving that split from the
  manifest was tried and rejected: removing a `.cjs` moved the entry into the excused
  bucket, and the gate stayed green on the defect it exists to catch.
