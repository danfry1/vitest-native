---
"vitest-native": patch
---

**`presets: { gestureHandler: false }` no longer turns off Gesture Handler's own Jest setup under the native engine.** A project that kept the setting from older mocks lost the setup too, so Gesture Handler's native module was the engine's generic stub and it warned `Failed to install UI runtime bindings`. `flashList: false` behaves the same. No action needed.
