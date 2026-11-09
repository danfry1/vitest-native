---
"vitest-native": patch
---

**A workspace library that a React Native workspace package imports without declaring it is now one module, not two.** Node loads such a library through the package's source, and Vite loaded it again for the test's own import. Each copy kept its own state, and the `SOURCE_EVALUATED_TWICE` guard reported its files. It is now among the packages Node compiles with that package, as a declared one is, so the test shares Node's copy. With `diagnostics` on, the run names each such import. Declare the library in the package's `dependencies` to make the dependency explicit.
