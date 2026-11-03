---
"vitest-native": patch
---

**Under the native engine, a package that depends on a workspace library now compiles that library's React Native dependencies.** Before, the engine compiled the dependencies of React Native packages only when the package under test declared them itself. A feature package depending on a workspace UI library that declares `expo-image` failed with `Cannot find module '…/expo-asset/build/Asset.fx'`, because `expo-asset`, reached through `expo-image` and `expo`, was never compiled. No action needed.

The same applies to a workspace member reached through `resolve.alias` (or tsconfig `paths`) without being declared. With `diagnostics: true` the plugin names such a member, since declaring it makes the dependency explicit. The workspace library itself still runs as the project's own source.
