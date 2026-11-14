# 0017-a. Build no separate strict isolation tier; re-run React per file only when every consumer gets the file's React

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/lint/vitest-native-rules.mjs`, `packages/vitest-native/tests/presets-hold-no-react.test.ts`, `packages/vitest-native/tests-native/hot-fresh-preset-react.test.ts`, `packages/vitest-native/tests-native/vitest.hot-fresh-runtime.config.mts`
- **Related:** [0014-c](0014-c-fix-retainers-by-name.md)

## Decision

There is no Jest-exact "strict" isolation tier beside stock and hot. React, its renderers
and scheduler are re-run per file only where nothing resident keeps an earlier file's
React; on main that is the opt-in `hotRuntime.freshRuntime`, under which every preset
factory takes the test file's React.

## Context

A prototype fresh renderer split React on Paper: 16 of 52 files failed and 126 tests went
from pass to fail, because resident code kept the first file's React. That, not cost, is
the reason. Cost was secondary: a fresh renderer per file cost 1.03–1.17× RSS, and a
snapshot process per file was 2.8× slower than warm fresh worlds. Evidence kept privately.

Resident React state does leak between files under hot: the `pfs-hot-use-id` and
`pfs-hot-warning-dedupe` bug-museum exhibits fail by default and pass under per-file
isolation. `freshRuntime` addresses that without a new tier, at about 20 ms per file at
one worker and 5 ms at four on a 135-file suite. The `preset-react-per-file` lint rule
and the tests above keep presets from holding a React of their own (#719).

## Consequences

- **Gains:** one isolation model with an opt-in, not a third tier to maintain.
- **Costs:** every resident module must take React from the file's context.
- **Limits:** under default hot, `useId` sequences and React warning de-duplication carry
  across files; per-file isolation (`hotRuntime: false`) is exact.

## Alternatives rejected

- A strict tier with a fresh renderer per file: split React on Paper.
- A snapshot process per file: tied to the exact Node binary, and 2.8× slower.
