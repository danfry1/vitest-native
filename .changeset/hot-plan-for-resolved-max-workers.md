---
"vitest-native": minor
---

**With `hotRuntime` on, the memory plan is sized for the workers that actually run, and a worker count you set is limited only by memory.** No action needed. To keep the old ceiling of four, set `maxWorkers: 4`.

- Before, Vitest applied `--maxWorkers` and `VITEST_MAX_WORKERS` after the plugin had planned, so `VITEST_MAX_WORKERS=10` ran ten workers under a plan and per-worker heap threshold sized for four. The plan is now rebuilt for the count Vitest resolves, before any worker starts.
- A count set in the config, with `--maxWorkers` or with `VITEST_MAX_WORKERS` is now bounded only by what host or container memory admits; the cap of four applies only when the count is automatic. Before, a config-file `maxWorkers: 16` ran four workers on a 16 GB laptop; it now runs 16, each recycling at a 512 MiB heap. When memory does lower a count you set, `hotRuntime capped maxWorkers from N to M` is printed.
- On Vitest 5, a native project beside a plain project with no worker count set no longer fails with "Projects … have different 'maxWorkers' but same 'sequence.groupOrder'". When `hotRuntime: 'auto'` falls back for such a group, the native project gets Vitest's resolved worker count.

`hotRuntime: { allowUnboundedMemory: true }` still leaves the count to Vitest.
