---
"vitest-native": patch
---

Stop overriding a configured `pool`, and refuse a mismatched Vitest instead of reporting nothing

Two fixes to the native engine's pool handling.

**A configured `pool` is no longer discarded.** A plugin's `config()` result is merged
over the user's config, and the native engine returned `pool: 'threads'`
unconditionally — so a project asking for `forks`, `vmThreads`, or its own custom pool
silently got `threads`, with no warning and no way to tell from the outside. `threads`
is now only a default, applied when no pool was configured. (`hotRuntime` still
supplies its own pool, since opting into it *is* choosing one, and now warns when that
overrides a configured pool.)

**`hotRuntime` now fails loudly when its worker would load a different Vitest.** The
hot worker entry ships inside vitest-native, so its `import 'vitest/worker'` resolves
from this package's location rather than the project's. Where a monorepo has more than
one Vitest install — a linked package, a hoisted `node_modules`, mixed versions across
workspaces — the worker and the host end up on different installations. Nothing about
that was visible: the start handshake succeeded, the run request was accepted, no
result was ever reported, and Vitest printed "No test files found" with no error at
all. The pool now compares the two resolved paths at config time and throws, naming
both, rather than letting a run pass having tested nothing.
