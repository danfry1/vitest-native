---
"vitest-native": patch
---

**`migrate` keeps Jest's `moduleNameMapper` order in `resolve.alias`.** Both take the first match, but the suggested config listed a catch-all such as `@` ahead of an anchored `/^@\/assets\/(.*)$/`, so `@/assets/x` resolved to `src/assets/x`. Run `vitest-native migrate` again, or move the specific entries above the catch-all by hand.
