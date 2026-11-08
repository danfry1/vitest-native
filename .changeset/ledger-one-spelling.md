---
"vitest-native": patch
---

**On Windows, the `SOURCE_EVALUATED_TWICE` guard now reports a file evaluated twice when the run starts from a short (8.3) path.** Node keeps a short name such as `C:\Users\RUNNER~1\...`, the default temporary directory on GitHub's Windows runners, where Vite uses the long one, so the guard never matched the two copies and stayed silent. `ownership.allow` entries now match either spelling too. No action needed.
