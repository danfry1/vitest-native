---
"vitest-native": patch
---

**Mock engine: the `safeAreaContext` preset's `useSafeAreaInsets` and `useSafeAreaFrame` read `SafeAreaInsetsContext` and `SafeAreaFrameContext`.** A test's own `SafeAreaInsetsContext.Provider` value now reaches components, as with the library. `setInsets()` still sets the default. No action needed.
