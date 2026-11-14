---
"vitest-native": patch
---

**Under the native engine, an Expo module's native-module mock that calls `jest.fn` or `jest.requireActual` loads without the jest-compat layer.** expo-font's `mocks/ExpoFontLoader.ts` is one, on SDK 57 and 58. Without `vitest-native/jest-compat` the mock threw as it loaded and the module fell back to the generic stub: `Font.getLoadedFonts()` returned a promise instead of `[]`. Such a file now loads as the package's own test support, with a `jest` of its own; `globalThis.jest` is never set. No action needed.
