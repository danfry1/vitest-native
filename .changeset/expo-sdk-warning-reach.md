---
"vitest-native": patch
---

**The unsupported Expo SDK warning now reaches packages that load Expo modules without `expo` resolving from them.** A workspace library that uses an Expo module from an older SDK, without depending on `expo` itself, got no warning and failed inside `expo-modules-core` instead. The plugin and `vitest-native doctor` now name the package they read. On an unsupported SDK, upgrade to Expo SDK 57 or 58.

- Where `expo` does not resolve from the project, the SDK is read from the `expo-modules-core` the project or its React Native and Expo dependencies resolve, for example `expo-modules-core 3.0.29 via expo-image is from an Expo SDK older than 57`.
- `expo` is also found through dependencies of dependencies, not only as the peer of a package the project declares.
- Scope: only React Native and Expo packages are followed. A version of `expo-modules-core` from before SDK 57 is reported as older than 57, not as a particular SDK.
