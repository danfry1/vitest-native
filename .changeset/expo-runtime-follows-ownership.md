---
"vitest-native": patch
---

**Under the native engine, a project that does not use `expo` runs even when `expo` is installed beside it.** The setup file installs Expo's winter runtime only when vitest-native compiles `expo` for the project: the project, or a manifest above it, declares `expo` or a package that depends on it, or `transform` names it. Before, it installed the runtime whenever `expo` resolved, and SDK 58 publishes that runtime as ES module syntax Node cannot run uncompiled. So a package beside an Expo app in a hoisted workspace, or a library whose `expo-*` devDependencies pull `expo` in as a peer, failed every test file in the setup, with `'expo' shipped source Node can't run directly` (Node 22.22.3 and later, Node 24) or `Cannot find module '…/expo/build/winter/runtime'` (Node 22.13). No action needed for a project that declares `expo`: it gets the runtime as before.

On every SDK, including 57 and earlier, a project where `expo` resolves without being declared no longer gets Expo's globals (`structuredClone`, `URL` and the others the runtime installs), as under jest-expo, which installs them only for projects using its preset. `presets: { expo: true }` alone does not count as declaring `expo`. A project that relies on those globals without declaring `expo` should declare it or add it to `transform`.
