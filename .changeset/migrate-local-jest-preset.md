---
"vitest-native": patch
---

**`vitest-native migrate` now reads a project-local Jest preset as Jest applies it.** A preset such as `preset: './jest.preset.js'` that spreads `jest-expo` is translated as `jest-expo`, and the settings it adds (`setupFiles`, `moduleNameMapper` and so on) are carried over, merged with the project's own the way Jest merges them. A local preset that spreads no known preset has all its settings translated and is flagged for review. Before, migrate reported it as an unknown preset and read only its test-discovery settings. No action needed.
