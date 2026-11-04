---
"vitest-native": patch
---

**The `safeAreaContext` preset serves react-native-safe-area-context 5.11's `SafeAreaCornerAdaptedInsetsContext`.** Importing it from a test using the preset gave `undefined`. `useSafeAreaInsets({ cornerAdaptation })` now answers the preset's regular insets, as the library's own Jest mock does when no provider sets corner-adapted insets. No action needed.
