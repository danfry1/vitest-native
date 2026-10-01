---
"vitest-native": patch
---

`vitest-native doctor` no longer warns that Expo core and expo-router setups "can hit known limits" and points at a migration-guide section that no longer exists. Those setups work under the native engine; doctor now reports the Expo version as covered and links the Expo guide, mentioning `vitest-native migrate` for jest-expo projects.
