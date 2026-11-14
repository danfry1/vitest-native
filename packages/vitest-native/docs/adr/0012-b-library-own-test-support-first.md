# 0012-b. Use each library's own test support first; hand-written presets only as drift-gated fallbacks

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: libraries' own mocks and setup files are declared in `preset-map.ts` (`LibraryMock`, `LIBRARY_SETUP_FILES`), not in the `{ mock } | { setupFiles } | { asItself }` shape, and some hand-written presets (navigation among them) have no library mock behind them.
- **Enforced by:** `packages/vitest-native/tests/preset-library-mocks.test.ts`, `packages/vitest-native/tests-native/gesture-handler-v3.test.tsx`, `packages/vitest-native/tests-native/library-setup-files.test.tsx`
- **Related:** [0012-a](0012-a-mock-only-at-native-boundary.md), [0011-c](0011-c-scoped-jest-for-library-support.md) (depends on), [0012-c](0012-c-library-mock-cost-in-stages.md)

## Decision

Library support is declared, never discovered, in one of three forms: the library's own
mock, its own setup files, or the library running as itself, optionally with a resolver
applied to its own files. A hand-written preset exists only as a declared fallback, and a
drift gate holds it to the library's own mock: a name the reference has and the preset lacks
fails the gate, and the list of known gaps may only shrink.

## Context

Hand-written presets were 4,158 lines. Against each library's own Jest mock, reanimated's
preset lacked 110 names and gesture-handler's lacked 36, which caused issues #341, #348 and
#351. Reanimated 4.7, worklets, safe-area-context, keyboard-controller, bottom-sheet and
netinfo ship their own mocks; gesture-handler and flash-list can run as themselves.

## Consequences

- **Gains:** fidelity follows each library's maintainers; missing-helper bugs go away; per-library preset factories are deleted as the drift list empties.
- **Costs:** a library's own mock loads more modules than a preset (see 0012-c).
- **Limits:** a library's own mock behaves as it does under Jest, including its no-ops, except where a registered correction applies.

## Alternatives rejected

- Keep hand-written presets: they miss names and drift.
- Auto-discover library support: it would apply mocks a library never intended.
- Edit a library's mock module: corrections are listed separately instead.
