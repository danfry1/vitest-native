---
"vitest-native": patch
---

**The react-native-screens preset renders a native-stack screen's header**, so `headerLeft`, `headerRight` and a custom title can be queried. Both engines. No action needed, but a test asserting that a hidden header's buttons are absent must now expect them.

native-stack hands those elements to `ScreenStackItem` as `headerConfig.children`, and the preset's `ScreenStackItem` rendered only the screen's content, so back buttons and header actions were missing (for example with `presets: { navigation: false }`, where the real native-stack runs). It now renders `ScreenStackHeaderConfig` with `headerConfig` after the content, as react-native-screens does, and no longer passes `headerConfig` as a host prop. As in react-native-screens, the header config and its children are rendered even with `headerShown: false`.
