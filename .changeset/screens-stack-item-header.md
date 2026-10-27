---
"vitest-native": patch
---

The react-native-screens preset's `ScreenStackItem` renders its header. native-stack passes `headerLeft`, `headerRight` and a custom title to `ScreenStackItem` as `headerConfig.children`, and the stub rendered only the screen's content, so header elements could not be queried (for example with `navigation: false`, where the real native-stack runs). The stub now renders `ScreenStackHeaderConfig` with `headerConfig` after the content, as react-native-screens does, and no longer passes `headerConfig` through as a host prop.
