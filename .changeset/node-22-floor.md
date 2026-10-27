---
"vitest-native": minor
---

**Breaking:** vitest-native supports Node 22.19 or later on Node 22, and Node 24.6 or later (`engines.node` is `>=22.19.0 <23 || >=24.6.0`; it was `>=20.19.0`). Node 20 reached end of life in April 2026. Node 22.19 and 24.6 are the first releases whose in-thread `module.registerHooks`, which the native engine's loader uses, passes a `require()`'s conditions. Earlier releases that have the hooks are not supported: on 22.15 the hot runtime and expo-router fail on Node bugs, on 24.0–24.2 `jest.mock` does not reach modules Node loads, and the rest of that band (22.16–22.18, 24.3–24.5) has not been cleared through every gate. Node 23 is past its end of life. `doctor` checks the whole range. RNTL 12, 13 and 14 stay supported, and CI runs RNTL 12 and 13 on Node 22.19 instead of Node 20.
