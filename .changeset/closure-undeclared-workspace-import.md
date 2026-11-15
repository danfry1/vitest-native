---
"vitest-native": patch
---

**A workspace library that a React Native workspace package imports without listing it in its dependencies is now one module, not two.** Node loads such a library through the package's source, and Vite loaded it again for the test's own import. Each copy kept its own state, and the `SOURCE_EVALUATED_TWICE` guard reported its files. It is now among the packages Node compiles with that package, as a listed one is, when the package imports it unconditionally (a top-level `import`, `export … from` or `require()`). With `diagnostics` on, the run names each such import. List the library in the package's `dependencies` to make the dependency explicit.
