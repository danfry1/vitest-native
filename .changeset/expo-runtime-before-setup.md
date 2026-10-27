---
"vitest-native": patch
---

In an Expo project, the native engine installs Expo's runtime globals (`URL`, `structuredClone` and the rest) before the project's setup files run, as jest-expo does, instead of at a test's first `expo` import. A `fetch` mocked in a setup file is no longer replaced once a test imports Expo. Global `fetch` stays Node's, so MSW, nock and undici's `MockAgent` keep intercepting, where Expo's native-driven `fetch` failed with `request.start is not a function`. Node's `FormData` also keeps working after Expo loads: Expo's patch for React Native's FormData made `append()` and `set()` throw.
