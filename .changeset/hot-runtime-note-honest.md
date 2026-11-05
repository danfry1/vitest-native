---
"vitest-native": patch
---

**`vitest-native init` and `migrate` no longer say the hot runtime usually makes large suites faster.**

The note now says what `hotRuntime: 'auto'` does: it reuses workers across test files instead of starting a fresh one per file. Whether that is faster depends on the suite. No action needed; to compare, run your suite with and without `hotRuntime: 'auto'`.
