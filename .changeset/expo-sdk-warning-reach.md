---
"vitest-native": patch
---

**Under the native engine, a test that loads `expo-modules-core` or `expo` from an unsupported Expo SDK now gets a warning naming the version and path.** A library using an older SDK's Expo modules without `expo` of its own failed inside `expo-modules-core` with no hint why.

Upgrade to Expo SDK 57 or 58 if the warning names a package your tests use. The check runs once per package directory in each test worker. The project-root check no longer counts an optional `expo` peer. See [Expo SDK support](https://danfry1.github.io/vitest-native/guide/expo#sdk-and-react-native-versions).
