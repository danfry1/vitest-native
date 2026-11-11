# A derived value stays at its first result between renders

- **Class:** presets
- **Source:** #351 (a user's app on 0.15.0-rc.4)
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

Under the native engine `react-native-reanimated` is Reanimated's own test mock, whose `useDerivedValue` runs its updater only when the component renders. A shared value the updater reads can change without a render: Reanimated reruns the updater then, but the mock does not. A child that React skips, such as one React Compiler memoizes, kept a derived value at its first result, and Skia read the stale value.

## Expected behaviour

A derived value follows the shared values its updater reads, as Reanimated's mapper keeps it: reading it after one changes gives the new result, with or without a render.
