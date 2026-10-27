---
"vitest-native": minor
---

**Breaking:** vitest-native supports Node 22.13 or later on Node 22, and Node 24.3 or later (`engines.node` is `>=22.13.0 <23 || >=24.3.0`; it was `>=20.19.0`). Node 20 reached end of life in April 2026. Node 22.13 is the first Node 22 that both RNTL 14 and the engine's CommonJS entry points (`require(esm)`) support. On Node 24.0–24.2, `jest.mock`, `jest.isolateModules` and `jest.resetModules` do not reach modules Node loads, with either loader. Node 23 is past its end of life. `doctor` checks the whole range. RNTL 12, 13 and 14 stay supported, and CI runs RNTL 12 and 13 on Node 22.13 instead of Node 20.
