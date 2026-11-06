---
"vitest-native": patch
---

**`init` and `migrate --write` say when the new config takes over from a `vite.config.*`.** Vitest reads a `vite.config.*` only when there is no `vitest.config.*`, so its plugins, `resolve` options and aliases silently stopped applying to tests. The CLI now names the file it shadows and shows how to extend it with `mergeConfig`. Under Vite+, a project with both files is now told about the `vitest.config.*` that Vitest loads.

No action needed. If tests relied on the Vite config, extend it as the CLI shows.
