---
"vitest-native": patch
---

**`init --force` and `migrate --write --force` replace the config Vitest loads.** With an existing `vitest.config.ts`, they wrote `vitest.config.mts` beside it and reported it replaced, but Vitest kept loading the `.ts`, so the config did not change. They now write over the file Vitest picks first, under its own name. A CommonJS `vitest.config.cjs` or `.cts` is refused with a message instead.

No action needed.
