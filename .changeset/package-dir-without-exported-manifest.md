---
"vitest-native": patch
---

**The native engine now detects and compiles a React Native package whose `exports` map leaves out `./package.json`.** Before, such a package was silently skipped. On Node versions that run the loader hooks off-thread (22.13–22.22.2, 24.0–24.11), Node then ran its ES module build as published and failed on its extensionless imports. Expo SDK 57's `expo-symbols` is one: on Android, expo-router requires it, and the run failed with `Cannot find module '…/expo-symbols/build/materialImageSource'`. No action needed. If you listed such a package in `transform: [...]` to work around this, the entry can go. The same lookup now serves the `react-native`-field alignment between Vite and Node.
