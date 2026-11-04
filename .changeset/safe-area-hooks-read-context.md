---
"vitest-native": patch
---

**The `safeAreaContext` preset's own mock reads its contexts in `useSafeAreaInsets` and `useSafeAreaFrame`, as the library's Jest mock does.** A test's `SafeAreaInsetsContext.Provider` value and `SafeAreaProvider`'s `initialMetrics` now reach components, and `setInsets()` still sets the default. Change a test that calls these hooks directly to call them inside a component or `renderHook`.
