# 0003-b. Expose worker state through one frozen global handle

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: a `Symbol.for('vitest-native')` object holds some context state but is not frozen, and 31 `__vitest_native_*` globals remain.
- **Enforced by:** `packages/vitest-native/scripts/structural-scorecard.mjs`
- **Related:** [0003-a](0003-a-project-context-file.md) (depends on), [0002-d](0002-d-structural-scorecard.md) (counts the globals)

## Decision

Worker state that has to cross module scope lives behind one frozen
`globalThis[Symbol.for('vitest-native')]` handle. No other `__vitest_native_*` global is added,
and the existing ones move behind the handle.

## Context

There were 27 `__vitest_native_*` globals in `src`, each a channel around module scope that a
reset, a second realm or a test can see or overwrite. Later fixes added more (31 today). A
single symbol-keyed handle cannot collide with user code and gives one place to inspect.

## Consequences

- **Gains:** one channel instead of dozens; the scorecard's global count drops toward one.
- **Costs:** every reader and writer of an existing global has to move.
- **Limits:** none for users.

## Alternatives rejected

- Keep string-named globals and document them: leaves the channels open and uncounted.
