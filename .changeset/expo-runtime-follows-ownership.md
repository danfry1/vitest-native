---
"vitest-native": patch
---

**Under the native engine, a project that does not use `expo` runs even when `expo` is installed beside it.** The setup file installs Expo's winter runtime only when vitest-native compiles `expo` for the project: it is declared by the project or a manifest above it, reached as a dependency of a package that is, or named in `transform`. Before, it installed the runtime whenever `expo` resolved, and SDK 58 publishes that runtime as ES module syntax Node cannot run uncompiled. So a package beside an Expo app in a hoisted workspace, or a library whose `expo-*` devDependencies pull `expo` in as a peer, failed every test file in the setup, with `'expo' shipped source Node can't run directly` (Node 24) or `Cannot find module '…/expo/build/winter/runtime'` (Node 22). No action needed. A project that declares `expo` gets the runtime as before. A project that relies on Expo's globals without declaring `expo` should declare it or add it to `transform`.
