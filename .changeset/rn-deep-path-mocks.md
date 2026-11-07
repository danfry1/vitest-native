---
"vitest-native": patch
---

**A `jest.mock` of a `react-native/Libraries/...` path now replaces the module `import { … } from 'react-native'` returns, as under Jest.** A mock of a module with platform files, such as `react-native/Libraries/Utilities/BackHandler`, applied to `BackHandler.js` while React Native loads `BackHandler.ios.js`, so `BackHandler.mockPressBack` was undefined. It now lands on the platform file, cold and under the hot runtime, and so does `vi.mock` with `experimental.nodeMocks`. A `jest.mock` inside a helper the test calls now applies when the helper runs, instead of failing with "defined outside of the module's top level scope". Remove any workaround that mocked the `.ios.js` file directly.
