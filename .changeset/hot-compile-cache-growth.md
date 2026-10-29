---
"vitest-native": patch
---

**Under the native engine's hot runtime, Node's compile cache no longer grows with every test file.** No action needed. ESM generation is on by default under the hot runtime: each test file re-evaluates the externalized ES modules it imports under a new URL, and Node's on-disk V8 compile cache, keyed by URL, gained an entry per module per file. In a measured case, a suite importing a 301-module ES package, a cold run wrote about 18,500 entries (147 MB). Workers wrote them when they exited, inside Vitest's `teardownTimeout`, which could end in `Timeout terminating`.

Hot workers with ESM generation now leave the compile cache off. That costs about 15–20 ms per hot worker boot, including each recycle (measured in one fixture: 451 → 471 ms median with 1 worker, and 614 → 658 ms for 4 workers and 8 files), in exchange for no cache growth and no teardown timeouts from it. Per-file isolation, and the hot runtime with `hotRuntime: { esmGeneration: false }`, keep the cache on.

Not covered: with `NODE_COMPILE_CACHE` set, Node enables the cache in every worker before vitest-native runs, and hot ESM-generation workers still write per-generation entries. Unset it for hot runs, or set `esmGeneration: false`. To reclaim space already used, delete `node_modules/.cache/vitest-native/v8`.
