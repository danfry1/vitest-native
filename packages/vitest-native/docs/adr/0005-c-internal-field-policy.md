# 0005-c. Keep the main-field policy internal: the react-native field by default, with per-package deviations

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: under `experimental.ownershipModel` both sides take the `react-native` field for packages without `exports`; there are no deviation entries, and the classification table has not been made.
- **Enforced by:** Review only
- **Related:** [0005-a](0005-a-shared-resolver.md) (depends on), [0001-b](0001-b-capped-flag-table.md) (why it gets no flag)

## Decision

Which legacy field a package without `exports` resolves through is internal, not a user
option, and has no `'metro'` value. The default is the current answer, the `react-native`
field on both sides. An exception is a per-package deviation entry with a probe. Changing the
default to `main` (Jest parity) needs a classification of the 23 corpus packages with a
string `react-native` field as format-only or a different implementation, and its own record.
Jest's condition set (`react-native`, `require`, `default`) applies only as a `jestCompat`
entry.

## Context

Jest takes `main`. Honouring `react-native` instead moves 14 obytes packages to TypeScript
source, about 1,010 files at 4.6 ms against 0.3 ms cold. But the field can point at a
different implementation than `main`, such as a native build against a web build, so switching
to `main` without the classification risks loading the wrong implementation. The question is
a trade-off, not a measurement.

## Consequences

- **Gains:** no permanent matrix axis; each exception is one reversible line.
- **Costs:** slower cold resolution than Jest for packages that ship source under the field.
- **Limits:** results can differ from Jest for packages whose `main` and `react-native`
  targets differ; each such case is a deviation entry.

## Alternatives rejected

- A public three-valued field option: adds a permanent axis, and no user asked for `'metro'`.
- Switch to `main` now: the fidelity cost for different-implementation packages is unknown.
