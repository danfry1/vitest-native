---
"vitest-native": patch
---

**`vitest-native migrate` lists the library mocks in your own Jest setup file that the presets cover.** A `jest.mock('react-native-reanimated', …)`, a Safe Area mock or a `require('react-native-gesture-handler/jestSetup')` in a file `setupFiles` names now each appear under "Covered by presets — delete", as the [migration guide](https://vitest-native.danfry.dev/migration/from-jest#delete-third-party-native-lib-mocks) says. The report also no longer mentions `jest-react-native`, a name React Native's own `(jest-)?react-native` allowlist only produces, and a `transformIgnorePatterns` entry a preset shadows is listed with the other entries that need nothing, under "Mapped automatically" (#795, #796, #797).

Delete the setup-file lines the report now lists, once the suite passes without them.
