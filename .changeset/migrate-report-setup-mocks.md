---
"vitest-native": patch
---

**`vitest-native migrate` lists the library mocks in your own Jest setup file that the presets cover.** A `jest.mock('react-native-reanimated', …)`, a Safe Area mock or a `require('react-native-gesture-handler/jestSetup')` in a `setupFiles` or `setupFilesAfterEnv` file now appears under "Covered by presets — delete", as the [migration guide](https://vitest-native.danfry.dev/migration/from-jest#delete-third-party-native-lib-mocks) says. A mock that keeps part of the library is listed for review instead. The report also stops calling `jest-react-native`, which only React Native's `(jest-)?react-native` pattern produces, not installed, and lists a preset-shadowed `transformIgnorePatterns` entry under "Mapped automatically" (#795, #796, #797).

Delete the setup-file lines the report now lists, once the suite passes without them.
