# 0007-b. Keep today's require precedence: per-file mock, then preset, then registry, then Node

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: library support (rank 5) and jest-compat's shims (rank 7) sit above per-file mocks, and root `__mocks__` are applied by the jest-compat transform rather than a reserved step.
- **Enforced by:** `packages/vitest-native/tests-native/node-dispatch-precedence.test.ts`, `packages/vitest-native/tests-native/dispatch-alias/alias-vs-preset.test.ts`
- **Related:** [0007-a](0007-a-one-node-dispatcher.md) (depends on)

## Decision

For a Node-side `require`, the steps answer in this order, outermost first: per-file user
mock, library-scoped `jest.mock`, a reserved root-`__mocks__` slot, preset shadow, React
Native registry, then Node. Builtins go straight to Node. The order changes only through a
Jest-semantics flag entry judged against Jest.

## Context

Before the dispatcher the effective precedence was set by install order: jest-compat's
wrapper installed last, so a per-file `jest.mock(name)` beat an active preset. Users rely on
that. Two divergences from Jest follow from the same order:

- `jest.mock('fs')` and other builtin mocks do not reach Node-owned modules.
- A preset beats a migrated `moduleNameMapper` alias; in Jest the mapper wins.

## Consequences

- **Gains:** existing suites keep their results; each pair (mock vs preset, preset vs registry, alias vs preset, builtin vs mock, both side channels) is a test.
- **Costs:** the two Jest divergences stay until a flag entry changes them.
- **Limits:** a builtin mock reaches only Vite's graph, and a preset beats an alias keyed on its package name. Both are documented divergences.

## Alternatives rejected

- Presets first: reverses both today's precedence and Jest's.
- Change precedence as part of the dispatcher work: a behaviour change hidden inside a refactor.
