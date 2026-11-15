# 0016-d. Add a public option only through a decision record, and remove a stable one only in a major

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: no test fails when an option is added without a record
- **Enforced by:** Review only
- **Related:** [0016-a](0016-a-one-flag-table.md)

## Decision

The target public surface of `reactNative()` is: `platform`, `engine`, `presets`,
`transform`, `nativeModules`, `ownership` (the ledger mode), `assetExts`, `diagnostics`,
and the isolation option once its name is decided. Every new public option needs a
decision record. A stable option is removed only in a major, and only after a per-test
comparison across the option's values shows no difference.

## Context

Ten top-level options, five `hotRuntime` sub-options and several implicit axes gave the
configuration matrix 12 × 12 cells, and bugs live where two axes cross. Experimental
options can go in a minor; stable ones cannot.

On main the options also include `projectBabel`, `registryBuild` and `hangTimeout`, plus
`experimental`, `hotRuntime`, `metroConfig` and `mocks`. `tests/documented-options.test.ts`
checks that every option is documented, and `tests/versioning-contract.test.ts` checks the
contract against the exports, but neither checks for a record. The option-snapshot test
this record relied on was not built.

## Consequences

- **Gains:** each addition is argued once, against the matrix cost.
- **Costs:** a small option needs a record.
- **Limits:** users keep stable options until a major.

## Alternatives rejected

- Keep every option indefinitely: each is another axis.
- Delete an axis when "every probe is identical": necessary, not sufficient, without a
  calibrated per-test comparison.
