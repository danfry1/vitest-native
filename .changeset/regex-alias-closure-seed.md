---
"vitest-native": patch
---

**Native engine: a workspace library reached through a regular-expression `resolve.alias` now has its React Native dependencies compiled, as one reached through a string alias does.** Tests that failed with `Cannot find module '…/expo-asset/build/Asset.fx'` now run. No action needed.

- Also applies to an alias with a `customResolver`.
- A replacement counts up to its first substitution (`$1`, `$<name>`), so `/repo/packages/ui/src/$1` reaches the library, while `/repo/packages/$1` still needs it declared as a dependency.
- Not covered: `test.alias`, and aliases other plugins resolve, such as `vite-tsconfig-paths`.
