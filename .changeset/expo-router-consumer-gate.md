---
"vitest-native": patch
---

Install React Native's ErrorUtils under the native engine; gate expo-router end to end

`global.ErrorUtils` — React Native's error-guard polyfill, installed on device by
InitializeCore — is read at module scope by Expo's `Expo.fx`
(`ErrorUtils.getGlobalHandler()`), so importing anything from `expo` under the
native engine failed with "ErrorUtils is not defined". The engine now installs the
real `@react-native/js-polyfills` implementation, resolved through the installed
React Native and compiled by the same hooks as the rest of its sources, once per
realm; nothing is hand-mocked.

The packed Expo consumer fixture gains an expo-router leg: a real SDK 56 project
with file-based `app/` routes (a stack layout, a home screen, a dynamic
`details/[id]` route), tested through expo-router's own `expo-router/testing-library`
— `renderRouter("./app")`, `testRouter.push`/`back`, `toHavePathname`,
`useLocalSearchParams` — exactly as its documentation shows and as a jest-expo
suite already contains. It runs against the real `@react-navigation/*` stack with
`presets: { navigation: false }` and the jest-compat layer, from a packed install
in the consumer gate.
