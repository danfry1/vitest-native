---
"vitest-native": minor
---

**Breaking: the navigation preset's `useNavigation()`, `useRoute()` and `useTheme()` now throw outside a render, as React Navigation's own hooks do, instead of returning a default.** Change such a test to call the hook through `renderHook` from `@testing-library/react-native`: `renderHook(() => useNavigation()).result.current`. The default hid a real hook error inside a render: with a second copy of React, `useTheme()` returned `DefaultTheme`, and the test failed far from the cause.
