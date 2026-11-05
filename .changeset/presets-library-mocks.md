---
"vitest-native": minor
---

**Under the native engine, the worklets, safe-area-context, keyboard-controller, bottom-sheet and netinfo presets are each library's own Jest mock**, as a Jest suite installs it. No action needed; snapshots of the presets' own output may change, and the mock engine keeps the hand-written presets.

- Safe-area insets are zero unless `<SafeAreaProvider initialMetrics>` sets them; `setInsets()` still sets them until `resetAllMocks()`.
- Bottom-sheet's views render only their children, and netinfo reports a connected cellular network.
- Names a preset served that a mock lacks stay: bottom-sheet's `*_STATUS` enums and footer components, netinfo's `useNetInfoInstance`.
