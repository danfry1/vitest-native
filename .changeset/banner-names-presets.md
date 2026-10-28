---
"vitest-native": patch
---

The engine banner names the presets a run applies, for example `[vitest-native] engine: native — real react-native@0.81.5 · mocked: navigation, safeAreaContext, screens (platform ios)`. Each preset replaces its whole library, and nothing in a run's output pointed at one: an app that rendered its real navigator under the navigation preset got a `NavigationContainer` that never calls `onReady` and a `navigate` that does nothing. Under the native engine the names are the list its test workers build their mocks from. The project's own preset modules (`presets: ['./my-preset.ts']`) are named as the config names them. The presets guide now warns about the navigation preset and shows how to turn it off (`presets: { navigation: false }`, with `screens: false` as well for a native-stack navigator's header).
