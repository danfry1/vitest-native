---
"vitest-native": patch
---

The native engine runs on Node 22.15–22.18 and 24.3–24.5. Its in-thread loader hooks tell a `require()` from an `import` by the conditions Node passes them, and on those versions a `require()` reports its conditions as an empty object instead of a list. Every `require()` was read as an `import` and reached the engine's loader, which compiled Babel's own files as Babel loaded them, so every test failed with "Reentrant preset detected". Node 22.19 and 24.6 onwards were unaffected, and so was Node 22.13, which uses the threaded loader.
