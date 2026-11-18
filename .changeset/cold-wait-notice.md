---
"vitest-native": patch
---

**A cold run that waits more than 5 s for React Native's precompiled modules now says so.** Since `registryBuild: 'wait'` became the default, a run on an empty cache builds them before the first test file. That usually takes about 3 s and stays silent. A slow or stuck build used to show nothing until the compile timed out, up to 120 s. It now prints one line to stderr after 5 s, and the wait finishes or times out as before. No action needed.
