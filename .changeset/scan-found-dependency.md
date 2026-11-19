---
"vitest-native": patch
---

**A dependency of an installed React Native package your project does not declare now fails by name when Node cannot run it.** That dependency is not compiled, so JSX, Flow or TypeScript in it failed with a bare `SyntaxError`, and an ES module build with extensionless imports with `ERR_MODULE_NOT_FOUND`. It now fails with `UNDECLARED_DEPENDENCY_UNCOMPILED`, naming the dependency and the package that depends on it. Add the dependency to `transform`, or declare the parent package in your dependencies.

- A package installed twice at different versions now has both copies' dependencies compiled.
- A package no longer compiles its optional peers' dependencies along with its own, including a peer only a sibling declares.
