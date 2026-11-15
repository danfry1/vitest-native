# A navigation container ref has no resetRoot

- **Class:** presets
- **Source:** #712 (found by the mock conformance probe)
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

The navigation preset serves `@react-navigation/*` under both engines. Its container ref (`createNavigationContainerRef()`, `useNavigationContainerRef()`) lacked methods that React Navigation 7 declares, among them `resetRoot`, `setParams`, `isFocused` and `preload`. `StackActions` lacked `popTo`, and `CommonActions` lacked `preload`, `replaceParams` and `navigateDeprecated`. A navigation service that called `navigationRef.resetRoot(…)` on sign-out failed with "is not a function".

## Expected behaviour

The container ref has the methods React Navigation 7 declares, as mock functions, and `StackActions.popTo` returns React Navigation's `POP_TO` action.
