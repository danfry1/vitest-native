---
"vitest-native": minor
---

**Native-engine tests can run as an Expo development build.** Set
`reactNative({ expo: { runtime: 'development-build' } })` to opt in; the default, `'expo-go'`, is
unchanged and matches jest-expo. In a development build the `ExpoGo` native module is absent from
`expo.modules`, `NativeModules` and `TurboModuleRegistry`, so `isRunningInExpoGo()` is `false` and
`TurboModuleRegistry.getEnforcing('ExpoGo')` throws. `NativeModules.EXDevLauncher` is present only
when `expo-dev-launcher` is installed (it comes with `expo-dev-client`), with no manifest loaded.
`expo-constants` reports `executionEnvironment: 'bare'` and `appOwnership: null`. A module a test
registers with `mockNativeModule()` still wins. The runtime is set per Vitest project, so a suite
that needs both runs two projects. Under the mock engine, setting `expo.runtime` fails with
`EXPO_RUNTIME_REQUIRES_NATIVE_ENGINE`.
