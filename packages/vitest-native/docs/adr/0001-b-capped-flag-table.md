# 0001-b. Ship behaviour changes as entries in one capped, dated flag table

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: the table holds `experimental.*` entries only; there is no `jestCompat.*` kind, no lifetime cap of five, and no field recording the decision.
- **Enforced by:** `packages/vitest-native/tests/flags.test.ts`
- **Related:** [0001-a](0001-a-build-in-place.md) (depends on), [0002-c](0002-c-rules-as-tests.md) (the test that checks it)

## Decision

Every behaviour change ships as one entry in a single table, either `experimental.<name>`
(opt-in, may change in any minor) or `jestCompat.<name>` (under the existing jest-compat
opt-in). Each entry records `{ adr, since, decideBy }`; `decideBy` is `since` plus six working
weeks, by which the entry becomes the default or is removed, and a promoted entry is removed
within four more weeks. At most two entries are live at once, and at most five `experimental`
entries exist over the whole plan. Internal policies, such as the resolver field policy, get no
flag.

## Context

A flag that outlives its decision becomes a permanent matrix axis. Stable minors had not
shipped for ten weeks, so a one-flag-per-change plan with each flag live for two minors would
have taken about sixteen minors. A cap that a test checks keeps the number of half-decided
changes small and makes an overdue decision block the release instead of drifting.

## Consequences

- **Gains:** a user can see every behaviour still in trial and when it will be decided; a
  stale flag fails CI.
- **Costs:** a third change waits for a slot; the cap forces flags to be decided in weeks.
- **Limits:** `experimental.*` options are outside semver, as `docs/versioning.md` allows.
  An unknown experimental key or a wrong value type is refused when options are validated.

## Alternatives rejected

- One flag per change, each live for at least two minors: too slow at the planned volume.
- Flagging internal policies such as the field policy: adds axes no user asked for; a
  per-package deviation entry does the same job ([0005-c](0005-c-internal-field-policy.md)).
