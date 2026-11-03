---
"vitest-native": patch
---

**Under the native engine, an Expo package's native-module mock written with `jest.fn` and `jest.requireActual` loads without the jest-compat layer.** expo-font's `mocks/ExpoFontLoader.ts` is one, on SDK 57 and 58; most other packages' mocks never touched `jest` and loaded before. Without `vitest-native/jest-compat` there was no `jest` global, the mock threw as it loaded, and the module fell back to the generic stub: `Font.getLoadedFonts()` returned a promise instead of `[]`, and `Font.isLoaded()` was the stub's. Only those two calls are supplied, and only while the mock loads: `jest.fn` is backed by `vi.fn`, `jest.requireActual` resolves relative to the mock file. A `jest` global that exists is left alone. No action needed. Not covered: a mock that calls `jest` later, from a method body, which still needs jest-compat.
