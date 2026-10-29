# EXPO_OS is unset under the native engine

- **Class:** env-contract
- **Source:** migration testing (2026-10)
- **Fixed by:** #343 (`origin/fix/recoverable-errors-and-expo-os`)
- **Needs:** nothing beyond this repository's install

## The bug

babel-preset-expo inlines `process.env.EXPO_OS` at build time, and Expo packages read it at run time (expo warns when it is missing). The native engine compiles with the React Native preset, so it was undefined in an Expo app's tests.

## Expected behaviour

In a project where `expo` resolves, `process.env.EXPO_OS` is the test platform (ios), as babel-preset-expo would make it.
