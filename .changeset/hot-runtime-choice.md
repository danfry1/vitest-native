---
"vitest-native": patch
---

**`vitest-native init` and `vitest-native migrate` say how to turn on the hot runtime.** No action
needed. Both commands now end with a short note: the hot runtime is off by default
(`hotRuntime: false`), `hotRuntime: 'auto'` reuses workers between test files and usually makes
large native-engine suites faster, and it has known differences from per-file isolation, linked to
the troubleshooting guide. The generated config is unchanged.
