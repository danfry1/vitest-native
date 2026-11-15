# 0016-c. Collapse the `hotRuntime` sub-options once resident-core recovery lands

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** No
- **Enforced by:** Review only
- **Related:** [0014-a](0014-a-admit-hot-only-when-recyclable.md), [0016-a](0016-a-one-flag-table.md)

## Decision

When the resident-core recovery work lands, `hotRuntime` keeps `false` and `'auto'`, and
`esmGeneration` and `preserveGlobals` become fixed behaviour. `recycleAfterFiles`,
`memoryLimit` and `allowUnboundedMemory` stay as Experimental options until the
one-worker rule and the isolation model are settled; then they fold into the isolation
option or are deprecated. No `hotRuntime` option is removed if watch-rerun or worker-boot
counts rise.

## Context

`hotRuntime` is Experimental (`docs/versioning.md`) and can change in a minor. Each
sub-option is another axis. The recycling options are kept because they are the only
memory backstop users have, and `allowUnboundedMemory` is the explicit opt-in for batched
hot at one worker (0014-a). The file-count recycle trigger is not made default-on.

On main, `esmGeneration` and `preserveGlobals` are still options, and a sixth, the
experimental `freshRuntime`, was added.

## Consequences

- **Gains:** fewer matrix cells once collapsed.
- **Costs:** users who set `esmGeneration: false` lose that trade.
- **Limits:** until it lands, all `hotRuntime` sub-options are documented and supported.

## Alternatives rejected

- Keep every sub-option: each is a matrix axis.
- Remove the recycling options now: they are the only backstop until the one-worker rule
  is decided.
