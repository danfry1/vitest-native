---
"vitest-native": patch
---

**Under `hotRuntime`, a file no longer inherits React Native Testing Library `configure()` options or `expect.extend` matchers from earlier files on its worker.**

Each file now starts from RNTL's defaults and with only the matchers and equality testers its setup files add, as under Jest and per-file isolation (#807, #808).

Add the `expect.extend` or `configure()` call to a file or setup file that relied on an earlier file's.
