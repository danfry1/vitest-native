# bottom-sheet's useBottomSheetScrollableCreator is missing

- **Class:** presets
- **Source:** #714
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

Under the native engine, @gorhom/bottom-sheet is its own Jest mock. That mock leaves out public API the package exports: `useBottomSheetScrollableCreator` and the other gesture and scroll hooks, and the constants such as `ANIMATION_CONFIGS` and `KEYBOARD_BEHAVIOR`. Its `useBottomSheetInternal()` answers every read with one `{ value: 0 }` stub, so its booleans were objects. A list that used the creator failed with `useBottomSheetScrollableCreator is not a function`.

## Expected behaviour

`useBottomSheetScrollableCreator()` gives a function that renders a scroll view with the props it is given, so the list renders its rows.
