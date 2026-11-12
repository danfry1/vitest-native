---
"vitest-native": patch
---

**With `diagnostics: true`, the hot runtime's per-file reset lines now print.** No action needed. Lines such as `hot reset: dropped N modules` were written while Vitest was starting the next file, which drops console output, so they never appeared. Hot-runtime diagnostics from the worker now go to stderr.
