---
"vitest-native": patch
---

**Native-engine config loads resolve each detected package once.** Under `engine: 'native'`, auto-detection and the module ownership policy looked up each detected package's directory four or five times per config load; they now share one lookup per package and directory. On an Expo app with 334 detected packages, config-time module resolutions drop from about 2,100 to 1,060, and each config load is roughly 15 ms faster on macOS. In a multi-project config, each project gets the saving. No action needed. The detected packages, the externalization patterns passed to Vitest and every ownership decision are unchanged. A package installed during a watch session is still picked up when Vitest reloads the config.
