---
"vitest-native": minor
---

**Breaking:** vitest-native supports Node 22.15 or later on Node 22, and Node 24.3 or later (`engines.node` is `>=22.15.0 <23 || >=24.3.0`; it was `>=20.19.0`). Node 20 reached end of life in April 2026. Node 22.15 is the first Node 22 with in-thread `module.registerHooks`, which the native engine's loader uses; older Nodes ran it on a separate loader thread. On Node 24.0–24.2, `jest.mock`, `jest.isolateModules` and `jest.resetModules` did not reach modules Node loads, and Node 23 is past its end of life. `doctor` checks the whole range. RNTL 12, 13 and 14 stay supported, and CI runs RNTL 12 and 13 on Node 22.15 instead of Node 20.
