---
"vitest-native": patch
---

Translate jest-expo presets in `vitest-native migrate`

`migrate` reported `preset: 'jest-expo'` as needing attention and pointed at known limits
that no longer apply. It now translates the preset: `jest-expo` and `jest-expo/ios` become
`reactNative()`, `jest-expo/android` becomes `reactNative({ platform: 'android' })`, and
`jest-expo/universal`, `jest-expo/web` and `jest-expo/node` are reported with what to do
instead. jest-expo does not mock React Navigation, so when a `@react-navigation/*` package is
installed (which activates the navigation preset) the suggested config sets
`presets: { navigation: false }`, keeping screens in real navigators as under Jest; a
project with its own root `__mocks__/@react-navigation` keeps the preset. The packed Expo
SDK 57 consumer gate now also runs expo-router's testing library under the configuration
`migrate --write` generates from a jest-expo setup.
