# 0002-c. Enforce the delivery rules with tests, not prose

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: only the flag-table test exists; the harness-reachability test, the seams registry with its detector, and the option snapshot are absent.
- **Enforced by:** `packages/vitest-native/tests/flags.test.ts`
- **Related:** [0001-b](0001-b-capped-flag-table.md) (the flag table it checks)

## Decision

Four tests, each about 50 lines, run on every pull request:

- **Flag table:** fails on more than two live entries, an entry past `decideBy` with no
  recorded decision, or more than five `experimental` entries over the plan.
- **Harness reachability:** every `test:*`, `validate:*` and `check:*` script and every
  validation entry point is run by a workflow, or carries an allowlist entry
  `{ owner, deleteBy }`; an expired or unused entry fails.
- **Seam detector:** every use of a private upstream internal in `src` (assignments to
  `Module._*`, Vitest worker internals, React internals, global timer forwarders) maps to an
  entry in a seams registry, which records the upstream package, versions covered, owning
  record and a probe that fails by name in its matrix cell.
- **Option snapshot:** a new resolved option key fails unless it cites a record.

## Context

Rules written only in prose did not hold: nine harnesses accumulated with no workflow running
them, and two package scripts were referenced nowhere. About 25 private upstream internals are
relied on, and only Vitest's were counted.

## Consequences

- **Gains:** a breach of a rule fails a build; seams are visible per upstream version.
- **Costs:** the registry and allowlists need upkeep with every new seam or script.
- **Limits:** none for users.

## Alternatives rejected

- Rules in prose only: that is how the unwired harnesses accumulated.
