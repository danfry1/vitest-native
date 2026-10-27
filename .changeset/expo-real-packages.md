---
"vitest-native": minor
---

Under the native engine, Expo modules run as their installed packages: the `expo` preset no longer replaces `expo-constants`, `expo-status-bar`, `expo-font`, `expo-asset`, `expo-splash-screen` and `expo-linking` there. Their own JavaScript runs on native-module mocks, as jest-expo runs them, so their whole API is present and current with the installed SDK: `import { hide } from 'expo-splash-screen'`, Expo's call since SDK 52, was `undefined` under the preset (#319), as were `setOptions`, `useAssets`, `getLoadedFonts`, `canOpenURL` and others. Measured on an Expo SDK 58 app against jest-expo, 15 of 17 probes of these packages matched with the packages running as themselves, against 4 with the preset.

Values the preset made up go: `Constants.expoConfig.name` was `'test-app'` and `Linking.createURL()` returned `exp://localhost:19000/…`; they are now what the package computes from its native module, as under jest-expo (`createURL` asks for a scheme in the app config). A suite that relies on the preset while it moves off it can turn it back on with `reactNative({ presets: { expo: true } })`. The mock engine keeps the preset. `doctor` and `migrate` describe the new behaviour.
