---
"vitest-native": patch
---

The engine banner names the presets a run applies, for example `[vitest-native] engine: native — real react-native@0.81.5 · mocked: navigation, safeAreaContext, screens (platform ios)`. Each preset replaces its whole library, and nothing in a run's output pointed at one: an app that rendered its real navigator under the navigation preset got a `NavigationContainer` that never calls `onReady` and a `navigate` that does nothing. The names are the list the test workers build their mocks from. The presets guide now warns about the navigation preset and shows how to turn it off (`presets: { navigation: false }`).
