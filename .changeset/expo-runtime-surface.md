---
"vitest-native": patch
---

**Under the native engine, `globalThis.expo` has every member of Expo's runtime.** The stand-in lacked `uuidv5`, `isRunningOnQuest`, `installOnUIRuntime`, `expoModulesCoreVersion`, `cacheDir`, `documentsDir` and `SharedRef`'s `nativeRefType`, so Expo code that reached them threw: `uuid.v5()` from expo-modules-core, for one, failed with "Native UUID type 5 generator implementation wasn't found". `uuidv5` now returns the name-based UUID a device returns, `installOnUIRuntime` is a no-op, and the rest answer as expo-modules-core's own JS runtime does. A test now reads that runtime from the installed expo-modules-core for each supported SDK and fails when the stand-in falls behind. No action needed.
