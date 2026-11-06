---
"vitest-native": patch
---

**Under the native engine, an Expo package's native-module mock written with `jest.fn` and `jest.requireActual` loads without the jest-compat layer.** expo-font's `mocks/ExpoFontLoader.ts` is one, on SDK 57 and 58; most other packages' mocks never touched `jest` and loaded before. Without `vitest-native/jest-compat` there was no `jest`, the mock threw as it loaded, and the module fell back to the generic stub: `Font.getLoadedFonts()` returned a promise instead of `[]`, and `Font.isLoaded()` was the stub's. An Expo module's `mocks/<NativeModule>` file now loads as the package's own test support, like a library's `jestSetup.js`: with a `jest` of its own, whose `requireActual` has Jest's semantics and whose `jest.fn` keeps the mock's implementation through a reset. `globalThis.jest` is never set. No action needed.
