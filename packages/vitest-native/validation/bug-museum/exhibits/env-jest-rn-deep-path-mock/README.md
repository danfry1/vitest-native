# jest.mock of a react-native/Libraries path misses what react-native exports

- **Class:** env-contract
- **Source:** react-native-paper trial (#573)
- **Fixed by:** #582
- **Needs:** nothing beyond this repository's install

## The bug

`jest.mock('react-native/Libraries/Utilities/BackHandler', …)` did not reach `import { BackHandler } from 'react-native'`, which Jest's single registry gives the mock. Tests calling `BackHandler.mockPressBack()` failed.

## Expected behaviour

The mock of the deep path is the module `react-native` exports.
