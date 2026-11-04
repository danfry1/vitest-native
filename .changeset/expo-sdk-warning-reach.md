---
"vitest-native": patch
---

**Under the native engine, the unsupported Expo SDK warning now covers packages that load Expo modules without `expo` resolving from the project.** A workspace library using an Expo module from an older SDK, without depending on `expo` itself, got no warning and failed inside `expo-modules-core` instead. On an unsupported SDK, upgrade to Expo SDK 57 or 58.

- What is read: the `expo` that resolves from the project, as before. Where none does, the plugin and `vitest-native doctor` read the version of `expo`, else of `expo-modules-core`, among the packages the native engine already detects and compiles for the run, for example `expo-modules-core 3.0.29 is from an Expo SDK older than 57`.
- Scope: the mock engine reads only the project's `expo`, as before. A version of `expo-modules-core` from before SDK 57 is reported as older than 57, not as a particular SDK.
