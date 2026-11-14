# 0011-a. Install the test environment in two groups: once at worker boot, and per file before user setup

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: globals are installed at worker boot (`worker.mjs`) and again by the setup file (`setup.mjs`), not from `onBeforeCollect`; no row is declared as frozen per file.
- **Enforced by:** Review only
- **Related:** [0008-a](0008-a-small-resident-renderer-set.md) (depends on), [0011-b](0011-b-environment-catalog-as-code.md)

## Decision

Environment rows that resident modules read at init (`NODE_ENV`, `__DEV__`, the RN setup
globals the renderer reads at load) are installed once, at worker boot, before the resident
preload, and are frozen per file. Every other row is installed per file from the runner's
`onBeforeCollect`, after the realm restore and before the user's setup files.

## Context

Vitest 4.1 and 5.0 call a custom environment's `setup()` once per worker, not per file.
Resident modules ([0008-a](0008-a-small-resident-renderer-set.md)) read some values once,
at init, so installing them per file changes nothing they see. Installing everything per file
therefore hides a divergence; installing everything at boot leaks per-file state.

## Consequences

- **Gains:** the install point of every row is explicit, and the per-file group runs at a boundary Vitest awaits.
- **Costs:** a row placed in the wrong group is wrong relative to user setup files.
- **Limits:** a test that sets `NODE_ENV` or another boot row per file does not reach the resident core: a documented divergence.

## Alternatives rejected

- A Vitest custom environment: its `setup()` runs once per worker.
- Install everything per file: resident modules read some values only at boot.
