---
"vitest-native": patch
---

The native engine runs on Node 22.15–22.18 and on early Node 24 releases (24.3 and 24.4 measured). Its in-thread loader hooks tell a `require()` from an `import` by the conditions Node passes them, and on those versions a `require()` reports its conditions as an empty object instead of a list. Every `require()` was read as an `import` and reached the engine's loader, which compiled Babel's own files as Babel loaded them, so every test failed with "Reentrant preset detected". Node 22.19 and 24.6 onwards list them and were unaffected, and so was Node 22.13, which uses the threaded loader.
