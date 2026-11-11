---
"vitest-native": patch
---

**`migrate` keeps Jest's `moduleNameMapper` order in `resolve.alias`.** Both take the first match, but the suggested config listed plain prefix aliases such as `@` ahead of anchored ones such as `/^@\/assets\/(.*)$/`, so `@/assets/x` resolved to `src/assets/x` instead of the directory Jest mapped it to. Each alias is now emitted where Jest declared it. Re-run `vitest-native migrate`, or move the specific entries above the catch-all by hand.
