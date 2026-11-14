# 0016-a. Put every temporary behaviour change under `experimental`, in one flag table

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: `hotRuntime.freshRuntime` is a temporary behaviour change outside the table, and the planned `jestCompat` key was not built
- **Enforced by:** `packages/vitest-native/tests/flags.test.ts`
- **Related:** [0016-c](0016-c-collapse-hot-runtime-options.md), [0017-d](0017-d-engineering-limits.md)

## Decision

Every behaviour change that is not yet the default is an option under the `experimental`
key and an entry in `src/flags.ts`, which names the record that owns it, the release that
shipped it, and the date by which it becomes the default or is removed. At most two
entries are live at once.

## Context

Each option is another axis of the configuration matrix, and bugs live where two axes
cross. Short-lived flags scattered across the options also never get removed: nothing
records when they were meant to end. One table with a date per entry makes an
undecided flag visible, and `tests/flags.test.ts` fails the build when an entry is past
its date, when more than two are live, or when an entry names an option validation does
not accept.

Jest-compatibility moves were meant to be a second key (`jestCompat`) in the same table.
On main, Jest compatibility ships as the `vitest-native/jest-compat` entry point instead,
with no flag key.

## Consequences

- **Gains:** every temporary change has an owner and an end date; a forgotten flag
  blocks the release.
- **Costs:** a third change in flight has to wait for a slot.
- **Limits:** users see at most two `experimental` options, each documented with its
  decision date.

## Alternatives rejected

- Flags under the option they modify (as `hotRuntime.freshRuntime` is): nothing tracks
  their end date.
- No cap on live flags: each one multiplies the matrix.
