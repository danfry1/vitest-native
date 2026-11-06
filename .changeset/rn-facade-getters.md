---
"vitest-native": minor
---

**Under the native engine, a test file that imports `react-native` now loads only the React Native modules it uses.** No action needed.

- Each export is read when a test uses it, as under Jest, instead of all at once on import, which loaded React Native's whole module graph.
- A change made to an export on the real `react-native` module is now visible through `import { … } from "react-native"` too.
