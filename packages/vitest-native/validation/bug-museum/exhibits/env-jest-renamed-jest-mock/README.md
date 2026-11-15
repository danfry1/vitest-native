# jest.mock through a renamed jest from @jest/globals is ignored

- **Class:** env-contract
- **Source:** react-native-paper bake-off (#833)
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

`import { jest as mockJest } from '@jest/globals'` is a common way to satisfy babel-plugin-jest-hoist's rule that a mock factory reads only variables prefixed `mock`. `jestMockTransform()` recognised only calls on an identifier named `jest`, so `mockJest.mock(…)` was neither hoisted nor registered. The module was not mocked, and the test failed later, far from the cause.

## Expected behaviour

A `jest` imported from `@jest/globals` under any local name, or reached through a namespace, is handled exactly like the global `jest`. A further binding the transform cannot follow (`const j = mockJest; j.mock(…)`) fails by name with `JEST_BINDING_NOT_FOLLOWED`.
