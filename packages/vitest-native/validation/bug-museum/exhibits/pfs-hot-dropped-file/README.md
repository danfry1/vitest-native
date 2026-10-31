# Under hot, a jest.mock of an RN module to null loses the next file

- **Class:** per-file-state
- **Source:** #350 (react-native-paper bake-off: hot gave 698-714 tests, nondeterministic)
- **Fixed by:** #350 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

The hot runtime's per-file reset restored React Native's state BEFORE clearing jest-compat's Node mock registry, so restoring Appearance read the null mock and threw outside Vitest's per-file error handling: the next file was never collected, every reporter omitted it, and the JSON report said success: true while Vitest exited 1. rc.8 is affected.

## Expected behaviour

Both files run and pass; Vitest exits 0 and every reporter accounts for both.
