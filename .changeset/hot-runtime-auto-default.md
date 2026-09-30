---
"vitest-native": minor
---

Use the hot runtime by default where it can be bounded

`hotRuntime` now defaults to `'auto'` under the native engine. A run reuses workers and resets
React Native's registry, the app/test module graph and the verified process state per file
whenever the scheduler provides recyclable boundaries (at least two workers within the memory
plan), no other pool is configured, and the suite is not set up for Jest migration
(`jestMockTransform()`, the jest-compat setup); otherwise it keeps Vitest's per-file isolation,
as before. A fallback the user did not ask about is silent; `diagnostics: true`, or setting
`hotRuntime: 'auto'` explicitly, prints the reason. `hotRuntime: false` restores per-file
isolation unconditionally, and `hotRuntime: true` still requires hot mode.
