---
"vitest-native": minor
---

**Native engine: tests can run as an Expo development build instead of Expo Go.** `isRunningInExpoGo()` is `false`, `ExpoGo` is absent from every native-module lookup, and `expo-constants` reports `executionEnvironment: 'bare'`.

To opt in, set `reactNative({ expo: { runtime: 'development-build' } })` per Vitest project; the default, `'expo-go'`, is unchanged.

- `NativeModules.EXDevLauncher` is present only when `expo-dev-launcher` (or `expo-dev-client`) is installed, with no manifest loaded. A `mockNativeModule()` still wins.
- The mock engine fails with `EXPO_RUNTIME_REQUIRES_NATIVE_ENGINE`; `presets: { expo: true }` fails with `EXPO_RUNTIME_CONFLICTS_WITH_EXPO_PRESET`.
- Details: [Expo Go or a development build](https://danfry1.github.io/vitest-native/guide/expo#expo-go-or-a-development-build).
