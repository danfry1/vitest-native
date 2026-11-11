---
"vitest-native": patch
---

**The navigation preset's `useNavigation()`, `useRoute()` and `useTheme()` now throw outside a render, as React Navigation's own hooks do, instead of returning a default.** The default also hid a hook error inside a render: with a second copy of React, `useTheme()` returned `DefaultTheme`, and a test failed far from the cause. Change a test that calls one of these hooks as a plain function to call it through `renderHook` from `@testing-library/react-native`.
