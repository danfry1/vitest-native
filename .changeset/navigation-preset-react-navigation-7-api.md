---
"vitest-native": patch
---

**The navigation preset now has the React Navigation 7 API it lacked, so tests calling it no longer fail with "is not a function".**

- Container refs: `resetRoot`, `setParams`, `setOptions`, `isFocused`, `getId`, `getParent`, `emit`, `removeListener`, `preload`, `replaceParams` and `navigateDeprecated`, as mock functions.
- `StackActions.popTo` and `CommonActions.preload`, `replaceParams` and `navigateDeprecated` return React Navigation's action objects. `StackRouter`, `TabRouter`, `DrawerRouter`, `NavigationProvider`, `createScreenFactory`, `createStandardNavigationFactories`, `NativeStackView` and `createNativeStackScreen` are exported.
- Existing exports behave as before. No action needed.
