---
"vitest-native": minor
---

**Breaking: vitest-native now requires React 19 and supports React Native Testing Library 13 or 14, and the native engine requires React Native 0.86+.** An older React or React Native stops at startup with `UNSUPPORTED_PEER`, for example `react-native 0.85.3 is not supported: the native engine supports react-native 0.86–0.88`; `vitest-native doctor` reports the same.

Upgrade to React Native 0.86 or later (Expo SDK 57 or later) and React 19, and move from React Native Testing Library 12 to 13 or 14.

- Testing Library 14 makes `render`, `fireEvent` and `act` async: `await render(<App />)`.
- The mock engine runs on any React Native.
- Testing Library outside 13–14, React Native above 0.88, or an Expo SDK other than 57 and 58, warns rather than fails.
