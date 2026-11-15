# 0017-d. Hold these engineering limits: two runtime dependencies, two live flags, no unrun gates, no silent fallbacks

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/scripts/check-package-size.mjs`, `packages/vitest-native/package-budget.json`, `packages/vitest-native/tests/flags.test.ts`, `packages/vitest-native/tests/ci-script-coverage.test.ts`, `packages/vitest-native/scripts/structural-scorecard.mjs`, `packages/vitest-native/lint/vitest-native-rules.mjs`
- **Related:** [0016-a](0016-a-one-flag-table.md), [0017-c](0017-c-product-scope-non-goals.md)

## Decision

| We do not | Checked by |
|---|---|
| Ship more than two runtime dependencies (today `flow-remove-types`, `magic-string`) | `scripts/check-package-size.mjs` against `package-budget.json` |
| Keep more than two live flags, or a flag past its decision date | `tests/flags.test.ts` |
| Keep a package script that no pull-request workflow runs, without a stated reason | `tests/ci-script-coverage.test.ts` |
| Add Node module patch sites, `VITEST_NATIVE_*` switches, `__vitest_native_*` globals or swallowed catches | `scripts/structural-scorecard.mjs` (counts may only fall) |
| Monkey-patch Vitest (`vi.*`, `expect.*`, global `jest`/`vi`/`expect`) outside listed sites | `lint/vitest-native-rules.mjs` (`no-monkey-patching`) |
| Add a permanent mode value without a decision record | Review only |
| Add an upstream workaround that is not registered | Review only (`tests/upstream-workarounds.test.ts` checks registered rows, not unregistered ones) |
| Patch dependencies, or React or scheduler internals | Review only |
| Throw when another tool installs a Node hook; we chain and warn | Review only |
| Set a global `jest` conditionally | Review only |
| Fall back silently; failures are reported by name | Review only |
| Decide module ownership by alias text, package name or first evaluator | Review only |
| Compile a file only after Node throws a `SyntaxError`; the engine parses first | Review only |
| Ship a public resolver field-policy option, or a `'metro'` policy | Review only |

## Context

These limits keep the package small and its behaviour inspectable. Some were written
after they were broken: a gate that only `prepublishOnly` ran sat red on main unseen, and
a wrapped mock method once made `vi.resetAllMocks()` loop forever.
`require(esm)` defeats compiling on Node's `SyntaxError`, since Node then loads the file
without throwing.

## Consequences

- **Gains:** the checked rows fail CI on violation; the rest have a named rule to cite.
- **Costs:** a third runtime dependency or flag needs a record and an explicit budget
  change.
- **Limits:** none visible to users.

## Alternatives rejected

Each row is the rejected alternative. Reopen a row only with a decision record.
