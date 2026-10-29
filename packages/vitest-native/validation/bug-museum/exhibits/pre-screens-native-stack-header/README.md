# The screens preset drops native-stack's header

- **Class:** presets
- **Source:** migration testing (2026-10)
- **Fixed by:** #341 (`origin/fix/screens-header-and-virtual-text`)
- **Needs:** nothing beyond this repository's install

## The bug

native-stack puts headerLeft, the back button and the title in `headerConfig.children`; the real ScreenStackItem renders `<ScreenStackHeaderConfig {...headerConfig} />` after its content (react-native-screens 4.16 ScreenStackItem.tsx). The screens preset's stub rendered the children only, so every header query failed (~50 back-button failures in the reporting suite).

## Expected behaviour

With `navigation: false` (a real React Navigation) and the screens preset on, the native-stack header renders headerLeft: `Go back` is queryable.
