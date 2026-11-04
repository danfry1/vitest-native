---
"vitest-native": patch
---

**Under the native engine, the unsupported Expo SDK warning now covers Expo modules a project loads without `expo` resolving from it.** A package using an Expo module from an older SDK, reached through another dependency or depending on `expo-modules-core` alone, got no warning and failed inside `expo-modules-core` instead. On an unsupported SDK, upgrade to Expo SDK 57 or 58.

- What is read: the `expo` that resolves from the project, as before. Where none does, the plugin and `vitest-native doctor` check every copy of `expo`, or failing any, of `expo-modules-core`, among the packages the native engine already detects for the run, and name an unsupported copy with the package that reached it, for example `Expo SDK 54 (expo 54.0.33, reached through kit) is not supported`. A supported copy is never warned about.
- `expo-modules-core` from SDK 55 on carries its SDK's number; an older one is reported as older than SDK 55.
- Not covered: the mock engine reads only the project's `expo`, as before. A package an active preset shadows (`expo` with `presets: { expo: true }`) or `transform.exclude` names is not checked, and one named in `transform: [...]` is checked only where another package reaches it.
