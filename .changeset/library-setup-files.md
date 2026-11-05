---
"vitest-native": minor
---

**Under the native engine, `react-native-gesture-handler` and `@shopify/flash-list` run as themselves, with the `jestSetup.js` each ships** before the project's setup files, as a Jest suite lists them. No action needed; to keep a preset, set `presets: { gestureHandler: true }` or `{ flashList: true }`.

- Gesture Handler 3's hook API, builder methods and test helpers work, and a `Pressable` press fires `onPress`.
- A `FlashList` renders a window of rows, as under Jest, where the preset rendered every row.
- `react-native-gesture-handler/Swipeable` and the other modules Gesture Handler 3 does not ship no longer resolve, as under Jest.
