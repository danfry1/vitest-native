# 0014-d. Install a world-keyed matcher registry only under per-file worlds, never on the default path

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** No
- **Enforced by:** Review only
- **Related:** [0014-c](0014-c-fix-retainers-by-name.md)

## Decision

A matcher registry that registers each `expect.extend` matcher once per worker and
forwards calls to the current file's implementation is installed only inside the
per-file-world isolation flag. When the current world never registered a name, the call
falls back to Vitest's behaviour, and the fallback is named.

## Context

chai's `used` list retains every registered matcher, which dominated heap growth under
per-file worlds (538 KiB per file before the fix, 79 KiB after). On main, with React
Native resident, the registry saves only 5–10 KiB per file and adds a seam into chai, so
it is not worth carrying on the default path. A forwarder keyed by world is needed so a
matcher never runs against an earlier file's world. Evidence kept privately.

The per-file-world flag this depends on is not on main.

## Consequences

- **Gains:** the default path gains no chai seam.
- **Costs:** a seam into chai and `@vitest/expect` behind the flag.
- **Limits:** under the fallback, a matcher one file registers stays visible to later
  files; Jest creates `expect` per file. Documented divergence, flag only.

## Alternatives rejected

- Registry on the default path: 5–10 KiB per file saved, for a permanent seam.
