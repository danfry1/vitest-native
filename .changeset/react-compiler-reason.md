---
"vitest-native": patch
---

**`vitest-native migrate` and `doctor` no longer say components render the same without React Compiler.** The compiler is still not needed for tests to run. Where `projectBabel: 'auto'` compiles a file with Babel for another entry, the compiler applies there too, and a memoized child given the same props skips re-rendering. The report now says so: a test that reads a value React does not track during render (a shared value, a ref, a module variable) can see that child keep its earlier value (#755).

No action needed. A test that depends on a child re-rendering can read the value through state or props instead.
