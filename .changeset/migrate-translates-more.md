---
"vitest-native": patch
---

**`vitest-native migrate` translates more of a Jest config, and lists the Reanimated settings vitest-native covers as safe to delete.** No action needed.

- A local preset such as `preset: './jest.preset.js'` is read as Jest applies it: one that spreads `jest-expo` translates as `jest-expo`, merged with the project's own settings. Before, it was reported as unknown.
- A `'^prefix/(.*)$'` `moduleNameMapper` becomes a `resolve.alias` for any literal prefix, and a `$`-anchored `testPathIgnorePatterns` literal a `test.exclude` glob.
- Reanimated's or Worklets' Jest `resolver`, a serializer that only strips animated props, and a setup file that only calls `setUpTests()` are reported as covered and left out.
