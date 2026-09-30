---
"vitest-native": minor
---

Use the hot runtime by default where it can be bounded

`hotRuntime` now defaults to `'auto'` under the native engine. A run reuses workers and resets
React Native's registry, the app/test module graph and the verified process state per file
whenever the scheduler provides recyclable boundaries (at least two workers within the memory
plan), no other pool is configured, the suite is not set up for Jest migration
(`jestMockTransform()`, the jest-compat setup), and the worker and the project resolve the same
Vitest version; otherwise it keeps Vitest's per-file isolation, as before.

When hot is selected, concurrency follows the hot memory plan, which caps automatic workers at
four. Set implicitly, `'auto'` is quiet about both its fallbacks and that cap;
`diagnostics: true`, or setting `hotRuntime: 'auto'` explicitly, reports them.
`hotRuntime: false` restores per-file isolation unconditionally, and `hotRuntime: true` still
requires hot mode and fails closed when it cannot be bounded — including on a Vitest version
mismatch, which `'auto'` treats as a reason to fall back.
