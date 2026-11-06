---
"vitest-native": patch
---

**`ErrorCode` now includes `HOT_RESIDENT_UNUSABLE` and `HOT_FILE_NOT_RUN`, two codes the hot runtime already throws.**

Code that narrows `error.code` can now name them. No action needed. Every code is described in the new [error-code reference](https://danfry1.github.io/vitest-native/guide/errors).
