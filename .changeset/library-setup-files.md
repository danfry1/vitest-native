---
"vitest-native": minor
---

**Under the native engine, `react-native-gesture-handler` and `@shopify/flash-list` run as themselves, with the `jestSetup.js` each ships** run before the project's setup files, as a Jest suite lists them in `setupFiles`. No action needed; `presets: { gestureHandler: true }` or `{ flashList: true }` keeps a preset, and `migrate` drops those setup files from a migrated config.

- The presets replaced the whole package, so Gesture Handler 3's hook API (`usePanGesture` and the rest), builder methods such as `onBegin` and `activeOffsetX`, and its own test helpers were missing. Now its native module and host components are its own mocks, and a `Pressable` press fires `onPress`.
- A `FlashList` renders a window of rows over the layout its setup measures (10 rows, then 15 once it fills in, as under Jest), where the preset rendered every row.
- `react-native-gesture-handler/Swipeable` and the other modules the preset made up for Gesture Handler 3, which does not ship them, no longer resolve, as under Jest.
- A `jest.mock` of a package, a library's own included, no longer sends every `require` in the file through the mock registry's resolver: only a require that can reach a mocked package is resolved, so the setup files leave a file that never imports these libraries as fast as before.
