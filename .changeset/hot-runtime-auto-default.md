---
"vitest-native": minor
---

Use the hot runtime by default where it can be bounded

`hotRuntime` now defaults to `'auto'` under the native engine. A run reuses workers and resets
React Native's registry, the app/test module graph and the verified process state per file
whenever the scheduler provides recyclable boundaries (at least two workers within the memory
plan) and no other pool is configured; otherwise it keeps Vitest's per-file isolation, as before.
A fallback the user did not ask about is silent; `diagnostics: true`, or setting
`hotRuntime: 'auto'` explicitly, prints the reason. `hotRuntime: false` restores per-file
isolation unconditionally.

`'auto'` also no longer excludes suites migrated from Jest (`jestMockTransform()`, the
jest-compat setup). The hot runtime resets its state before user setup files run, and two
migrated real-app suites (react-native-paper, 708 tests; the obytes Expo template, 36) measured
identical per-test outcomes under hot and per-file isolation, with react-native-paper running in
under a third of the wall time.
