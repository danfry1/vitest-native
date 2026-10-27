---
"vitest-native": minor
---

Under the native engine, Expo modules run as their installed packages, answering as they do under jest-expo. The `expo` preset no longer replaces `expo-constants`, `expo-status-bar`, `expo-font`, `expo-asset`, `expo-splash-screen` and `expo-linking` there; their own JavaScript runs, so their whole API is present and current with the installed SDK. `import { hide } from 'expo-splash-screen'`, Expo's call since SDK 52, was `undefined` under the preset (#319), as were `setOptions`, `useAssets`, `getLoadedFonts`, `canOpenURL` and others.

Their native modules answer as jest-expo answers them: from a package's own `mocks/`, else from Expo's table of the native modules, which jest-expo ships and vitest-native now carries, extracted from jest-expo 58.0.12 (`src/native/expo-module-table.mjs`; a weekly check compares it with the newest jest-expo). This also gives every other Expo module jest-expo's values: `Device.modelName` is `'mock'`, `Constants.statusBarHeight` is `54`. On an Expo SDK 58 app, every probe of these six packages matches jest-expo (17 of 17, against 4 with the preset).

What a suite that relied on the preset sees instead, each as under jest-expo:

- `Constants.expoConfig` is `{}` (was `{ name: 'test-app', slug: 'test-app', version: '1.0.0', extra: {} }`), so `expoConfig.name` and `expoConfig.extra` are `undefined`. `Constants.appOwnership` is `null` (was `'standalone'`), `executionEnvironment` is `'mock'` (was `'storeClient'`), and `getWebViewUserAgentAsync()` resolves `undefined`.
- `Linking.createURL()` and `Linking.parse()` throw for want of a scheme in the Expo manifest (they returned `exp://localhost:19000/…` URLs). A test that needs them mocks `expo-constants` with a scheme, which now reaches expo-linking's own import of it, or mocks `expo-linking`.
- `Font.isLoaded()` is `false` until a font is loaded (was always `true`), and `Asset.fromModule()` of a number that is not a bundled asset throws (it returned a made-up asset). Bundled images and fonts load through the real expo-asset and expo-font.
- `preventAutoHideAsync()` and `hideAsync()` resolve `undefined` (were `true`).

A suite can keep the preset while it moves off it with `reactNative({ presets: { expo: true } })`. The mock engine keeps the preset.

Three engine changes come with it. A module the ESM loader compiles is now loaded through Node's CommonJS loader, so an import and a require share one instance (expo-asset 57's asset registry was a second, empty copy) and a `jest.mock` factory reaches a package's own require of the mocked module. TypeScript under node_modules from a package nothing selected for compiling is compiled rather than refused (an Expo module installed without `expo`). `doctor` and `migrate` describe the new behaviour.
