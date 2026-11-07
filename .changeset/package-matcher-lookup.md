---
"vitest-native": patch
---

**Under the native engine, checking whether Node compiles a file no longer grows with the number of React Native packages.** The check runs on every file Node resolves or loads. It used to test each file against two patterns per package, hundreds on an Expo project. It now looks the package name up after each `node_modules` segment, and checks the file's parent directories against the linked packages' directories. No action needed.
