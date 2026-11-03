---
"vitest-native": patch
---

**Native-engine config loads are faster on projects with many React Native packages.** Under `engine: 'native'`, each config load now resolves a package's directory once per lookup: auto-detection keeps its own memoized lookup, and the module ownership policy shares one with the linked-package check. On a large Expo app this cuts config-time module resolutions from about 2,100 to about 1,100, roughly 14 ms per config load; each project in a multi-project config gets the same saving. No action needed. The detected packages, the externalization patterns passed to Vitest and every ownership decision are unchanged, and a package installed during a watch session is still picked up when Vitest reloads the config.
