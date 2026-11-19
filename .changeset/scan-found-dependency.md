---
"vitest-native": patch
---

**A dependency of an installed React Native package your project does not declare now fails by name when it ships untranspiled source.** That dependency is not compiled, so JSX, Flow or TypeScript in it failed with a bare `SyntaxError`. It now fails with `UNDECLARED_DEPENDENCY_UNCOMPILED`, naming the dependency and the package that depends on it. Add the dependency to `transform`, or declare the parent package in your dependencies.

- A package installed twice at different versions now has both copies' dependencies compiled.
- An optional peer's dependencies are compiled only when your project declares that peer.
