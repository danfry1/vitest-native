---
"vitest-native": patch
---

`hotRuntime` stays `false` by default, as in 0.13.0: under the native engine each test file runs in a fresh worker. The hot runtime, which reuses workers across files and is faster on most suites, is available with `hotRuntime: 'auto'`; four known differences from per-file isolation are listed in the troubleshooting guide. Release candidates 0.14.0-rc.1 to rc.8 defaulted to `'auto'`, so a project that relied on that sets `hotRuntime: 'auto'` to keep it.
