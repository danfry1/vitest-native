---
"vitest-native": patch
---

**A snapshot of an Expo component that passes a ref as a prop, like expo-image's `Image`, is stable again under the native engine.** expo-modules-core's `createSnapshotFriendlyRef()` is React's `createRef`, so a snapshot printed the view and React's fiber tree behind each ref: thousands of lines with render timings that changed on every run. It now returns the ref jest-expo serves, which prints as `"[React.ref]"` and still holds its view. Run `vitest -u` once to rewrite snapshots written with the old output.
