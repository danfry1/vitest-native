---
"vitest-native": patch
---

**`vitest-native migrate` translates more of a Jest config, and lists the Reanimated settings vitest-native covers as safe to delete.** No action needed.

- A local preset such as `./jest.preset.js` is read as Jest applies it: one spreading `jest-expo` translates as `jest-expo`; one spreading no known preset is translated and flagged for review.
- A `'^prefix/(.*)$'` mapper becomes a `resolve.alias` for any prefix, and a `$`-anchored `testPathIgnorePatterns` literal a `test.exclude` glob when that skips no directory.
- Where the Reanimated preset applies, Reanimated's Jest `resolver`, a serializer that only strips animated props and a setup file that only calls `setUpTests()` are listed as covered.
