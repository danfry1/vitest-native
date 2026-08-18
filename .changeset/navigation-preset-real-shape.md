---
"vitest-native": patch
---

Navigation preset matches @react-navigation/native's shape; a disabled preset's package detects like any other

Two gaps that both surfaced by rendering router-driven screens under the native
engine — the shape most Expo apps have.

`createNavigatorFactory(Navigator)` now returns the real factory shape, yielding
`{ Navigator, Screen, Group }`. It returned a bare mock function whose result was
undefined, so any library building on the public factory API — expo-router extracts
its `Screen`/`Group` primitives through `createNavigatorFactory({})()` — failed at
import with "Cannot read properties of undefined (reading 'Screen')". The preset
also gains the exports `@react-navigation/native` adds on top of core:
`LinkingContext`, `LocaleDirContext`, `UNSTABLE_UnhandledLinkingContext`,
`DefaultTheme`, `DarkTheme` (real colors and platform font stacks), `createStaticNavigation`,
`ServerContainer`, `useLinkBuilder`, `useLinkProps`, `useLocale`, `useRoutePath`.
`ThemeContext` is seeded with `DefaultTheme`, as in the real package.

Disabling a preset — `presets: { navigation: false }` — now returns its packages to
ordinary ecosystem detection. Detection used to skip every preset package
unconditionally, so turning the preset off un-shadowed `@react-navigation/*` but
left it undetected: nothing compiled its untranspiled `lib/module` source and it
failed at load. That is the configuration under which the real React Navigation
stack, and expo-router's own `expo-router/testing-library` on top of it, run under
the native engine — `renderRouter` renders and `router.push` navigates.
