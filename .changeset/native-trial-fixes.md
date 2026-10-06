---
"vitest-native": patch
---

Native engine fixes found by running a large production Expo app's existing suite.

- React Native's setup now runs before the project's own setup files. A setup file that imported `react-native` or `@testing-library/react-native` failed on React Native's Flow source whenever the hot runtime was not in use.
- Importing `expo` (directly, or through packages such as `expo-location`) works: Expo's dev-server message socket is stubbed on every load path, and packages a compiled CommonJS module requires internally stay shadowed by their presets instead of loading the real native packages.
- `require('#/…')` and `jest.requireActual('#/…')` resolve the project's `resolve.alias` entries and, when Vite resolves them for imports, its tsconfig `paths`.
- App source required through Node compiles `export * as ns from '…'` when the project's toolchain provides the Babel plugin, as Expo's does.
- `react-native-nitro-modules` imports under the native engine: its native install step provides a proxy with no hybrid objects, and creating one throws `NITRO_HYBRID_OBJECT_UNAVAILABLE`.
- `react-native-mmkv` 3 and later run their own built-in test mode, with their real API and change listeners; the `mmkv` preset now applies to mmkv 2 only.
