---
"vitest-native": minor
---

React Native 0.88 and Expo SDK 58 join the supported matrix

The verified range is now 0.81–0.88: the CI matrix gains a 0.88 row (and the Vitest 4 floor's newest-RN cell moves up to it), the workspace pins 0.88, and the published range statements follow. All 85 cross-check probes match on 0.88 and `check-compat` covers every stable export.

The packed Expo consumer moves to SDK 58 (React Native 0.88, RNTL 14), and an SDK 57 consumer stays alongside it. The SDK 58 consumer also checks that the presets provide every `expo-linking` and `expo-constants` member expo-router's build uses, and that loading `expo` and `expo-router` leaves Node's timers and `Promise` in place.
