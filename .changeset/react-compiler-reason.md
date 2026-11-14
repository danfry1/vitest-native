---
"vitest-native": patch
---

**`vitest-native migrate` and `doctor` no longer say components render the same without React Compiler.** The compiler is still not needed for tests to run, but it applies to the files `projectBabel` compiles with Babel. There a memoized child skips re-rendering, so a test that reads a value React does not track during render can see an earlier value. Other files run without it, so a test that counts renders can see more than under babel-jest (#755).

Set `projectBabel: 'always'` where a suite depends on React Compiler running on every file, as under babel-jest.
