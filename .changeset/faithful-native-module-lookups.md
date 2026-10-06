---
"vitest-native": minor
---

Native engine: native module lookups answer the way a device does

`NativeModules[name]` and `TurboModuleRegistry.get(name)` returned a stub for every name, so a module that no app registers looked present. Library feature detection then took the wrong branch: expo-constants checks `NativeModules.EXDevLauncher` and, finding it, threw at import while parsing the stub's `manifestString` as JSON.

React Native returns `undefined` from `NativeModules[name]` and `null` from `TurboModuleRegistry.get(name)` for an unregistered module, and Jest's React Native preset does the same. The native engine now does too:

- React Native's own native modules stay present for every lookup. The set is read from the installed `react-native`: every name its JavaScript passes to `TurboModuleRegistry.get` or `getEnforcing`, so it follows the project's React Native version.
- `TurboModuleRegistry.getEnforcing(name)` still returns a stub for any name, where React Native would throw, so code that requires a native module keeps running without setup.
- A module registered with `mockNativeModule()` is present for all three lookups. Under the hot runtime, a registration a test file leaves behind is removed before the next file runs.

If a test relied on an unregistered module being present through `NativeModules` or `TurboModuleRegistry.get`, register it with `mockNativeModule(name, impl)` from `vitest-native/helpers`, in the test or a setup file.
