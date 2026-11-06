---
"vitest-native": patch
---

**`vitest-native migrate` translates more Jest settings on its own.** A `moduleNameMapper` entry of the form `'^prefix/(.*)$' → '<rootDir>/dir/$1'` becomes a `resolve.alias` for any literal prefix (such as `~e2e` or `~/.rnstorybook`), not only `@/`, `~/` and `src/`. A `$`-anchored `testPathIgnorePatterns` literal such as `'\\.d\\.ts$'` becomes a `test.exclude` glob when no directory in the project would also be skipped by it. `watchPathIgnorePatterns` and `workerIdleMemoryLimit` are dropped with a note instead of being flagged as unrecognized. No action needed.
