---
"vitest-native": minor
---

**Under the native engine, the worklets, safe-area-context, keyboard-controller, bottom-sheet and netinfo presets are each library's own Jest mock**, as a Jest suite installs it. No action needed; the mock engine keeps the hand-written presets. Tests that relied on the presets' own behaviour may change:

- `react-native-worklets` is Worklets' `lib/module/mock.js`. The real package's JS implementation fails every file with react-native-gesture-handler 3 ("`getUIRuntimeHolder` is not supported on web"), under Jest as well. `runOnJS`, `runOnUI`, `scheduleOnRN` and `scheduleOnUI` behave as with that mock; the preset ran them synchronously.
- `react-native-safe-area-context` is its `jest/mock`: insets are zero on a 320×640 frame (the preset gave 47/34 on 390×844) unless `<SafeAreaProvider initialMetrics>` provides them, and `useSafeAreaInsets` and `useSafeAreaFrame` are mock functions. `setInsets()` sets what `useSafeAreaInsets` returns, until `resetAllMocks()`.
- `react-native-keyboard-controller`, `@gorhom/bottom-sheet` and `@react-native-community/netinfo` are their own mocks (`jest`, `mock`, `jest/netinfo-mock.js`): keyboard-controller's hooks return `Animated.Value`s and are mock functions; bottom-sheet's views render only their children (a `BottomSheetView`'s `testID` is not on the tree); netinfo reports a connected cellular network.
- One difference from Jest is deliberate: bottom-sheet's default import is its `BottomSheet` component, where Jest's interop hands a suite the mock's whole module object, which does not render.
