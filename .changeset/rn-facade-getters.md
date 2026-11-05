---
"vitest-native": minor
---

**Under the native engine, a test file that imports `react-native` now loads only the React Native modules it uses.** Each `react-native` export is now read when a test uses it, as Jest does, rather than all at once when the file imports `react-native`. Before, that import ran every lazy getter on React Native's index and loaded its whole module graph. On four real suites, React Native module evaluations fell by 70 to 93% and Node resolutions by 18 to 33%. No test that passed before fails, and 4 react-native-paper tests that check `AccessibilityInfo` subscriptions now pass, as they do under Jest. No action needed. A change made to an export on the real `react-native` module is now visible through `import { … } from "react-native"` as well.
