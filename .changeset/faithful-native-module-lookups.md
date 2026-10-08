---
"vitest-native": minor
---

Native engine: native module lookups answer the way a device does

`NativeModules[name]` and `TurboModuleRegistry.get(name)` returned a stub for every name, so a module that no app registers looked present. Library feature detection then took the wrong branch: expo-constants checks `NativeModules.EXDevLauncher` and, finding it, threw at import while parsing the stub's `manifestString` as JSON.

React Native returns `undefined` from `NativeModules[name]` and `null` from `TurboModuleRegistry.get(name)` for an unregistered module, and Jest's React Native preset does the same. The native engine now does too:

- React Native's own native modules stay present for every lookup. The set is read from the installed `react-native`: every name its JavaScript passes to `TurboModuleRegistry.get` or `getEnforcing`, so it follows the project's React Native version.
- A React Native module's stub has only the members of its codegen spec, read from the same installed copy. Any other property is `undefined`, as on a device. A stub that answered every name with a function broke code that probes objects for optional properties: Node's `EventEmitter` read `captureRejections` from `NativeKeyboardObserver` when a test mocked `NativeEventEmitter` with it.
- `TurboModuleRegistry.getEnforcing(name)` still returns a stub for any name, where React Native would throw, so code that requires a native module keeps running without setup.
- A module registered with `mockNativeModule()` is present for all three lookups. Under the hot runtime, a registration a test file leaves behind is removed before the next file runs.

`nativeModules: 'permissive'` restores the earlier behaviour (every name present, every member a method) for a suite that depends on it.

If a test relied on an unregistered module being present through `NativeModules` or `TurboModuleRegistry.get`, or on a method a React Native module's spec does not declare, register it with `mockNativeModule(name, impl)` from `vitest-native/helpers`, in the test or a setup file.
