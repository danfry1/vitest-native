---
"vitest-native": patch
---

**A project setup file that imports `react-native` now runs under `sequence.setupFiles: 'parallel'`.** The engine's own setup file ran alongside the project's, which could import `react-native` before its require hooks existed and fail with `SyntaxError: Unexpected token 'typeof'`. Its setup files now always run first, in order, and a project that sets `'parallel'` runs its setup files as a list. No action needed.
