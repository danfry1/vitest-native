---
"vitest-native": patch
---

**A hot test file looks up React Native's dependencies once per worker, not once per module that needs them.** React Native's precompiled modules require packages such as React by absolute path, and each of those calls went through Node's resolver again in every file: 57 resolutions per warm file in a gesture-handler and reanimated suite, 128 with `hotRuntime.freshRuntime`. Now 4 and 14. No action needed.
