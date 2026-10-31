---
"vitest-native": patch
---

**An Expo SDK outside 57–58 gets a warning that names the supported SDKs.** vitest-native supports Expo SDK 57 and 58. On an earlier SDK, Expo code could fail with nothing naming the cause: on SDK 54, every Expo view threw `Cannot read properties of undefined (reading 'viewManagersMetadata')`. The plugin now warns once at startup, and `vitest-native doctor` warns in its Expo section, with the installed `expo` version and the supported SDKs to upgrade to. A warning, not an error: the run still starts. The `expo` checked is the one the project resolves, directly or as the peer of a package it declares, so a workspace package that uses no Expo package is not warned about another app's. The Expo guide no longer says SDK 54 and later are covered.
