---
"vitest-native": minor
---

Actionable errors and engine transparency for migration failure points.

- **Untransformed-package explainer**: when an externalized `node_modules` file throws a SyntaxError that fingerprints as untranspiled JSX/Flow/TypeScript (`Unexpected token '<'` and friends), the error now names the owning package and states the fix — `reactNative({ transform: ['<pkg>'] })` — with a link to the migration guide, instead of a bare Node compile stack. This is the single most common migration blocker observed in real-app bake-offs.
- **Decorated Babel failures**: a Babel crash inside the native transform now reports the file, platform, and owning package at the single transform choke point (ESM loader, CJS require hook, and `requireActual` all inherit it), chaining the original error as `cause`.
- **Engine banner**: one log line per process states which engine actually ran (`engine: native — real react-native@X` / `engine: mock — …`), so a silent `auto` fallback can never masquerade as real-RN testing.
- **Config-time fail-fast**: explicit `engine: 'native'` without `@react-native/babel-preset` / `@babel/core` now fails at config time with install instructions, instead of starting the run and dying inside the loader. The `auto`→mock fallback notice is now emitted via `console.warn`, and the Flow-strip parse-failure warning is always visible (no longer diagnostics-gated).
- **jest-compat signposts**: `jest.isolateModules`, `jest.createMockFromModule`, `jest.genMockFromModule`, and `jest.deepUnmock` now throw errors that name the API and its closest Vitest migration instead of bare `is not a function` TypeErrors; `jest.retryTimes` warns once and continues instead of crashing the suite.
