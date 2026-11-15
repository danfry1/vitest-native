# 0015-a. Keep the mock engine for projects without a React Native toolchain, with its scope frozen

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/tests/detect.test.ts`
- **Related:** [0015-b](0015-b-mock-engine-cross-check-floor.md), [0017-c](0017-c-product-scope-non-goals.md)

## Decision

The mock engine (`engine: 'mock'`, `src/mocks`) stays a supported engine. `engine: 'auto'`
picks it only when the React Native Babel toolchain or `react-native` cannot be resolved,
and says so. Its scope is frozen: it gets cross-check fixes and catalog rows, never new
mock features. It shares the project context and extension and alias resolution with the
native engine, but not the hot runtime, the precompiled registry or library-support
declarations.

## Context

The mock engine is a hand-written reimplementation of React Native, about 3,700 lines.
Of seven public `vitest.config.*` files that used vitest-native when this was decided,
five pinned `engine: 'mock'`, all component libraries with no React Native toolchain.
Speed is not the reason to keep it: with the precompiled registry the native engine is
about as fast, and the mock engine still runs with `isolate: true` (about 124 ms per file
at scale). Evidence kept privately.

## Consequences

- **Gains:** library authors without a toolchain keep a working setup.
- **Costs:** a hand-written surface to maintain, and the `engine` axis stays.
- **Limits:** the mock engine has no hot runtime. Its per-file cost has not been measured
  since; until it is, applying hot's scheduling to it is not considered.

## Alternatives rejected

- Delete it: most public configs that used vitest-native depended on it. Reconsider if
  a quarterly GitHub code search for `"vitest-native" "engine: 'mock'" path:vitest.config`
  finds nothing two quarters running.
- Rebuild it on the native engine: that needs the toolchain it exists to avoid.
