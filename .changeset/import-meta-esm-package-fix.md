---
"vitest-native": patch
---

**The `IMPORT_META_IN_NODE_OWNED` error now names the whole fix for a package published as an ES module.** For a `"type": "module"` or `.mjs` package, `transform: { exclude: [...] }` alone left the package to Node, uncompiled, where `import.meta.env` is undefined. The message and the [error reference](https://vitest-native.danfry.dev/guide/errors#IMPORT_META_IN_NODE_OWNED) now say so. Add such a package to `test.server.deps.inline` as well as to `transform.exclude`, so that Vite loads it.
