# Changelog

All notable changes to this project will be documented in this file.
This project uses [changesets](https://github.com/changesets/changesets) for versioning.

## 0.1.0

Initial release.

- Complete `react-native` module mock (21 components, 25+ APIs)
- Native bridge mocks (NativeModules, TurboModuleRegistry, UIManager, NativeEventEmitter)
- 7 built-in presets: Reanimated, Gesture Handler, Safe Area, Navigation, Async Storage, Screens, Expo
- Auto-detect presets from installed packages
- Platform extension resolution (`.ios.ts`, `.android.ts`, `.native.ts`)
- Asset stub imports (images, fonts, video, audio)
- Test helpers: `setPlatform`, `setDimensions`, `setColorScheme`, `mockNativeModule`, `resetAllMocks`
- Snapshot serializer with clean JSX-like output
- Auto-registered RNTL matchers when `@testing-library/react-native` is installed
- Dual ESM/CJS build
