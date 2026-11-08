# Re-rendering Reanimated's real Animated.Text throws

- **Class:** env-contract
- **Source:** react-native-paper trial (#583)
- **Fixed by:** #585 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

react-native-paper's FABExtended test serves the real Reanimated through `jest.mock` and `jest.requireActual`. On a re-render, Reanimated's animated component looks up the host view behind its ref with React Native's `findHostInstance_DEPRECATED`. A Text's `RCTText` host was a bare string host, whose ref the renderer rejected: `Argument appears to not be a ReactComponent. Keys: instance`. Under Jest the test passes.

## Expected behaviour

The re-render works, as under Jest: Text's host goes through the same boundary class as View's, so its ref is a component instance.
