# 0007-a. Route Node's CommonJS hooks through one dispatcher of ranked steps

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: the `Module._extensions` handlers and the ESM loader hooks still install outside the dispatcher, and the `INTERCEPTOR_CHAINED` warning does not exist.
- **Enforced by:** `packages/vitest-native/tests-native/node-dispatch-precedence.test.ts`, `packages/vitest-native/tests/node-dispatch-evaluation.test.ts`, `.github/workflows/ci.yml`
- **Related:** [0007-b](0007-b-keep-node-require-precedence.md) (the order the steps keep)

## Decision

Each Node CommonJS hook (`Module._load`, `Module._resolveFilename`) gets one entry, written
to `Module` once per worker. Every interceptor is a named step with a fixed rank that
receives `next`, and no step writes to `Module` itself. A loader installed after ours
(pirates, module-alias, proxyquire) wraps the entry and is chained, with one named warning
(`INTERCEPTOR_CHAINED`); it never causes an error.

## Context

Node-side interception was a stack of wrappers, each installed separately: the preset
shadow, the React Native registry, jest-compat's per-file mocks, export-condition recovery
and the hot runtime's resolution tracker. The order they were installed in was their
precedence, and that order was written down nowhere. Two side channels
(`__vitest_native_node_mock_for`, `__vitest_native_preset_require`) reach steps without
passing through `Module._load`. The work landed as one mechanical PR (each wrapper's
`origLoad.call` becomes `next(...)`), followed by one PR per remaining wrapper, so every
intermediate state stayed green and each PR could be reverted on its own.

## Consequences

- **Gains:** precedence lives in one table (`LOAD_STEPS`, `RESOLVE_STEPS`); a request costs one call per step, as a wrapper did; an unknown step name fails with `UNKNOWN_DISPATCH_STEP`.
- **Costs:** "three patch sites" is a goal, not a promise: both ESM loader APIs remain, and observers such as the ownership ledger sit beneath the steps.
- **Limits:** a later loader that replaces rather than wraps `Module._load` bypasses every step.

## Alternatives rejected

- Merge everything into a new order in one PR: puts every intermediate state at risk and would have reversed user-mock precedence.
- Throw when a later hook is detected: breaks module-alias, proxyquire and pirates.
- On failure, fold the work into the runtime core instead: concentrates risk; stopping with the dispatcher in place is a valid end state.
