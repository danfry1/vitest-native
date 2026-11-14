# 0011-b. Keep the Jest-like environment as a catalog of install functions, each with one probe

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** No: environment behaviour is still spread across `globals.mjs`, `setup.mjs`, the hot worker, the mock engine's setup and jest-compat's setup, with no catalog or probe set.
- **Enforced by:** Review only
- **Related:** [0011-a](0011-a-two-environment-install-groups.md)

## Decision

Each environment behaviour is one install function and one probe test, with only
`{ id, source, probe }` as metadata, shared by both engines. The first rows are v1 parity
(RN setup globals, `IS_REACT_ACT_ENVIRONMENT`, `JEST_WORKER_ID`, jest-compat's global `jest`,
RNTL text host and cleanup, `EXPO_OS` and Expo's runtime order) and are a refactor with no
behaviour change. Probes run in CI. An axis (`globals`, `jest-compat`, engine, hot) is
deleted only when every probe agrees across its values and a per-test compare on the corpus
agrees too.

## Context

Jest's test environment was rebuilt in five places, and whether each piece ran depended on
four configuration axes. Bugs in Expo's `EXPO_OS`, error equality, fake-timer options,
recoverable errors, nested `Text` and RNTL cleanup without globals each came from one copy
drifting from another.

## Consequences

- **Gains:** one place for environment behaviour; each bug class becomes a function with a probe; the duplicated globals and boot code go.
- **Costs:** a per-file counter: rows installed per file must not exceed the catalog count, and setup may grow at most 0.5 ms per file.
- **Limits:** none for users; a row that changes a per-test result against the previous release is reverted.

## Alternatives rejected

- A metadata DSL for rows: it has one consumer.
