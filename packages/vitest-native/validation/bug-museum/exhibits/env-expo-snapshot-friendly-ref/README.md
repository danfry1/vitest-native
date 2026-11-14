# A snapshot prints the fiber tree behind an Expo ref

- **Class:** env-contract
- **Source:** #849
- **Fixed by:** #849 (open)
- **Needs:** nothing beyond this repository's install (expo-modules-core's `Refs` is vendored)

## The bug

expo-image makes `nativeViewRef` and `containerViewRef` with expo-modules-core's `createSnapshotFriendlyRef()` and passes them to its native view as props. That function is React's `createRef`, so under the native engine a snapshot printed the host instance behind each ref and React's fiber tree with it. The result was about 18,000 lines, with render timings that differ on every run.

## Expected behaviour

The ref prints as `"[React.ref]"`, as jest-expo serves `createSnapshotFriendlyRef`, and still holds the view it is attached to.
