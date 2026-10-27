---
"vitest-native": patch
---

Under the native engine, an Expo native module is present only when an installed package defines it, as on a device. The engine read every name as present, so a package probing for an optional module called into a stub instead of taking its fallback: importing `expo-image` failed with `Cannot read properties of undefined (reading 'expo-image')`, because it found expo-observe's `ExpoObserve`. The module names are read from the installed Expo modules' native sources and cached until the install changes; a module a package mock stands in for is present too, and a project with no Expo modules installed is unaffected.
