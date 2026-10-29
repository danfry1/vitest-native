---
"vitest-native": patch
---

**The startup banner names the presets a run applies**, for example `[vitest-native] engine: native — real react-native@0.81.5 · mocked: navigation, safeAreaContext, screens (platform ios)`. No action needed.

Each preset replaces its whole library, and before, nothing in the output said one was active: an app that rendered its real navigator under the navigation preset got a `NavigationContainer` that never calls `onReady` and a `navigate` that does nothing. Under the native engine the names are the list the workers build their mocks from; the project's own preset modules (`presets: ['./my-preset.ts']`) are named as the config writes them. In a multi-project run the banner prints once, for the first project. The presets guide now says what the navigation preset replaces and how to turn it off: `presets: { navigation: false }`, plus `screens: false` for a native-stack navigator's header.
