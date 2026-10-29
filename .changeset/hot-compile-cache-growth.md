---
"vitest-native": patch
---

**Under the hot runtime, Node's compile cache no longer grows with every test file.** No action needed. With hot ESM generation on (the default when `hotRuntime` is on), each test file re-evaluates the externalized ES modules it imports under a new URL, and Node's on-disk V8 compile cache, keyed by URL, gained an entry per module per file. Workers wrote them all when they exited, inside Vitest's `teardownTimeout`: a large ES package could reach tens of thousands of entries on a cold cache, and enough of them made worker shutdown print `Timeout terminating`. Hot workers with ESM generation now leave the compile cache off; a resident worker compiles React Native once anyway, so warm runs are unaffected. Per-file isolation, and the hot runtime with `hotRuntime.esmGeneration: false`, keep the cache on.

To reclaim space already used, delete `node_modules/.cache/vitest-native/v8`.
