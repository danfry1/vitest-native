---
"vitest-native": patch
---

**`vitest-native migrate` lists the Reanimated test settings vitest-native already covers as safe to delete.** Where the Reanimated preset applies, three settings are reported under "covered" with the reason, and left out of the generated config: Reanimated's or Worklets' Jest `resolver`, a snapshot serializer that only strips `jestAnimatedStyle`/`jestAnimatedProps`/`jestInlineStyle`, and a setup file that only calls `setUpTests()`. A file that does anything more is carried over as before. Before, they were flagged for manual review or kept. No action needed.
