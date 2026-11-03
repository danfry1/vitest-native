---
"vitest-native": patch
---

**Under the native engine, an Expo package's own native-module mock loads without the jest-compat layer.** Expo writes these mocks for Jest: `jest.fn()` around each member, and `jest.requireActual()` for what the web build supplies, as in expo-font's `mocks/ExpoFontLoader.ts`. Without `vitest-native/jest-compat` there was no `jest` global, the mock threw as it loaded, and the module fell back to the generic stub: `Font.getLoadedFonts()` returned a promise instead of `[]`, and `Font.isLoaded()` was the stub's. The two calls are now supplied while the mock loads, with `jest.fn` backed by `vi.fn` and `jest.requireActual` resolving relative to the mock file; a `jest` global that exists is left alone. No action needed.
