---
"vitest-native": patch
---

**Under the native engine, `uuid.v5()` from expo-modules-core returns a name-based UUID and `installOnUIRuntime()` no longer throws.** `uuid.v5()` matches a device's result for a valid namespace and rejects an invalid one with the device's error. `LegacyEventEmitter` given an Expo module returns the module itself, as on a device. The runtime's remaining keys now exist, with jest-expo's values. No action needed.
