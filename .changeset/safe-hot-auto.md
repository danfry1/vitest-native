---
"vitest-native": patch
---

Add conservative automatic selection for the bounded native hot runtime

`hotRuntime: "auto"` now enables persistent native workers only when the current
configuration has recyclable task boundaries, enough host/container memory for at
least two workers, no Jest-migration plugin or setup, and no explicitly selected
pool. Otherwise it preserves stock per-file isolation and reports the reason.
Selection runs after other Vite config hooks, so later-contributed pools and setup
files cannot create a mixed runtime.

A packed consumer gate proves safe enablement plus one-worker, Jest compatibility,
and explicit-pool fallbacks. Explicit `hotRuntime: true` keeps its existing
fail-closed semantics.
