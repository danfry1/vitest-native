---
"vitest-native": patch
---

Under the native engine, `expo-image` can be imported. `globalThis.expo.modules` answered every native module name, so a package probing for an optional module with `requireOptionalNativeModule` called into a stub instead of taking its fallback: expo-image found expo-observe's `ExpoObserve` and failed with `Cannot read properties of undefined (reading 'expo-image')`. A module that an installed package only probes for, and that no installed or local Expo module defines in its native sources, now reads as absent, as on a device. Every other module stays present, so a module that exists cannot read as missing. The scan is cached until the install changes.
