---
"vitest-native": patch
---

**@gorhom/bottom-sheet's `useBottomSheetScrollableCreator`, `useScrollHandler`, the gesture and scroll handler hooks, and its constants (`ANIMATION_CONFIGS`, `KEYBOARD_BEHAVIOR`, `INITIAL_LAYOUT_VALUE` and the rest) exist under both engines.** The library's own Jest mock, which the native engine serves, leaves them out. Its `useBottomSheetInternal()` answered every read with one `{ value: 0 }` stub, so `enableOverDrag` and the other booleans were objects. Its `useBottomSheet()` gave animated values without listeners or `modify()`. The engine now adds the missing names and gives these hooks a closed sheet's values with the package's defaults. `createBottomSheetScrollableComponent` now returns a memoised component that takes a ref. No action needed.
