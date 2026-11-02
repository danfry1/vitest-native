---
"vitest-native": patch
---

**A smaller install: the package is about 30% smaller (385 KB packed, down from 551 KB).** No action needed. The package no longer ships CommonJS builds that no entry point can reach: the CLI's (`bin` runs `cli.mjs`) and the chunks used only by the root, `setup` and `presets` entries, which already resolve `require()` to their `.mjs` builds. Every entry in `exports` resolves as before, and the `.mjs` files are unchanged. `CHANGELOG.md` and an internal design note are no longer in the package. The changelog is [on GitHub](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/CHANGELOG.md), and the migration, versioning and release-readiness guides still ship under `docs/`.
