---
"vitest-native": minor
---

**Breaking: React Native 0.86–0.88, React 19 and React Native Testing Library 13 or 14 are now required** (peer ranges `react` `>=19`, was `>=18`; `@testing-library/react-native` `>=13 <15`, was `>=12 <15`). Under the native engine, a React Native older than 0.86 stops the plugin at startup with `UNSUPPORTED_PEER` (`react-native 0.85.3 is not supported: the native engine supports react-native 0.86–0.88`); `vitest-native doctor` reports it as blocking. A React older than 19 stops the same way. React Native 0.86 is Expo SDK 57's, so the supported React Native and Expo SDK ranges now line up.

Upgrading: move to React Native 0.86 or later (Expo SDK 57 or later) and React 19. Then, if you use React Native Testing Library 12, move to 13 or 14 (14 makes `render`, `fireEvent` and `act` async: `await render(<App />)`).

Unchanged: the mock engine does not load React Native, so it still runs on any React Native. A React Native newer than 0.88, an Expo SDK outside 57–58 and an RNTL outside 13–14 are warnings, not errors.
