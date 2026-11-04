---
"vitest-native": patch
---

**Under the native engine with `nativeModules: 'permissive'`, importing `expo` or `expo-constants` works again.** In 0.14.0-rc.10 and rc.11 it threw `Unexpected token '(', "(...args) "... is not valid JSON`. No action needed.

`NativeModules.EXDevLauncher` is now absent by default, as in Expo Go, which the default runtime models (as jest-expo does). Only expo-dev-launcher registers that module, in a development build, and expo-constants parses its `manifestString` whenever it is present. It is absent from `NativeModules`, from `'EXDevLauncher' in NativeModules`, from `TurboModuleRegistry.get` and from `globalThis.expo.modules` in every mode, and `TurboModuleRegistry.getEnforcing('EXDevLauncher')` throws React Native's own "could not be found" error. A test that needs the module still gets it with `mockNativeModule('EXDevLauncher', …)`. Every other module answers as before, in both modes.
