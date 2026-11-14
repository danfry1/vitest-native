# An animated style stays at its first result between renders

- **Class:** presets
- **Source:** #754 (found beside #351's stale derived value)
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

Under the native engine `react-native-reanimated` is Reanimated's own test mock, whose `useAnimatedStyle` and `useAnimatedProps` run their updater only when the component renders, and whose `useAnimatedReaction` never calls its reaction. A shared value the updater reads can change without a render: Reanimated reruns the updater then and applies the result to the view, but the mock does not. A child that React skips, such as one React Compiler memoizes, kept its first style, and `toHaveAnimatedStyle` read the stale one.

## Expected behaviour

An animated style follows the shared values its updater reads, as Reanimated's mapper keeps it: the style a test reads after one changes is the new result, with or without a render.
