---
"vitest-native": minor
---

**Breaking:** vitest-native requires Node 22.15 or newer (was 20.19). Node 20 reached end of life in April 2026. Node 22.15 is the first Node 22 with in-thread `module.registerHooks`, which the native engine's loader uses; older Nodes ran it on a separate loader thread. `doctor` reports the new floor. RNTL 12, 13 and 14 stay supported, and CI runs RNTL 12 and 13 on Node 22.15 instead of Node 20.
