# jest.replaceProperty() throws under jest-compat

- **Class:** env-contract
- **Source:** react-native-paper trial (#575)
- **Fixed by:** #588 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

`jest.replaceProperty(Platform, 'OS', 'android')`, a common way for a Jest suite to test platform branches, threw `jest.replaceProperty() has no Vitest equivalent`. Thirteen react-native-paper tests failed on it.

## Expected behaviour

The value is replaced in place, as jest-mock 29.7 does it, and `jest.restoreAllMocks()` puts the original back.
