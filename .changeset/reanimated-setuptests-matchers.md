---
"vitest-native": patch
---

**A setup file that calls Reanimated's `setUpTests()` keeps `toHaveAnimatedStyle` and `toHaveAnimatedProps` working under the native engine.** No action needed; keep or delete the call.

With Reanimated 4.7+ the engine serves Reanimated's own mock, which exports `setUpTests()`. It registered Reanimated's matchers over the engine's, and those read props the mock never sets, so every animated-style assertion after the call failed with `Received: {}`. The call now still sets its frame time, but leaves the engine's matchers in place.
