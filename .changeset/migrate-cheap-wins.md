---
"vitest-native": patch
---

**`vitest-native migrate` translates more Jest settings on its own.** A `moduleNameMapper` entry of the form `'^prefix/(.*)$' → '<rootDir>/dir/$1'` becomes a `resolve.alias` for any literal prefix (such as `~e2e` or `~/.rnstorybook`), not only `@/`, `~/` and `src/`. It is anchored as the Jest pattern is, so a bare import of the prefix is left alone. A `$`-anchored `testPathIgnorePatterns` literal such as `'\\.d\\.ts$'` becomes a `test.exclude` glob when no directory in the project would also be skipped by it. `watchPathIgnorePatterns` and `workerIdleMemoryLimit` are dropped with a note instead of being flagged as unrecognized. No action needed.
