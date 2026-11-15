# 0017-c. Keep these product non-goals until their reopen condition is met

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/vm-pool-guard.test.ts`
- **Related:** [0015-a](0015-a-keep-mock-engine-frozen-scope.md), [0017-d](0017-d-engineering-limits.md)

## Decision

vitest-native does not do the following. Each row says what checks it and what would
reopen it.

| We do not | Checked by | Reopen if |
|---|---|---|
| Isolate by realm or run the native engine on a VM pool | `tests/vm-pool-guard.test.ts` (refuses `vmThreads`/`vmForks`) | Vitest ships cheap realms |
| Build a parallel v2 runtime beside v1 | Review only | The in-place delivery plan's kill criteria fire |
| Generate TurboModule stubs with `@react-native/codegen` (a regex scan of specs is used) | Review only | A stub-shape bug is reported against the scan |
| Host React Native in a single Vite graph | Review only | Vite gains a CommonJS-native graph that keeps `require` cycles and lazy getters, or a registry-style graph passes the bug museum |
| Compile React Native, Flow or codegen specs with Oxc | Review only | Oxc supports Flow component syntax and enums |
| Run on Hermes, Fabric or Fantom | Review only | A distributable runtime appears, or a probe lane is scoped |
| Target react-native-web | Review only | — |
| Fetch anything at run time | Review only | A distribution design is approved |
| Ship a codemod that edits user tests (`migrate` never edits test files) | Review only | — |
| Auto-discover a library's test support and apply it unasked | Review only | — |
| Edit a library's own mock module (corrections are separate entries) | Review only | — |
| Lead with speed, or claim Jest always mocks React Native | Review only | Never |

## Context

Every row was proposed at least once. Writing them down stops them being argued again
without new evidence. Measurements behind them: realm isolation cost 6–40 ms per file
against 1–4 ms for a shared realm; Oxc rejected 370 of React Native's 418 files; one
mechanical React Native to ESM conversion broke its cycles and lazy getters. Jest's
React Native preset runs real React Native JS, so "Jest always mocks it" is false.
Evidence kept privately.

## Consequences

- **Gains:** review time goes to open questions.
- **Costs:** a list like this can harden; every row has a reopen condition.
- **Limits:** Hermes semantics (Intl, `Date` parsing, `Error.stack`, regex) are not
  probed; Jest shares this gap.

## Alternatives rejected

Each row is the rejected alternative.
