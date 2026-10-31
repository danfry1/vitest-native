---
"vitest-native": patch
---

**`vitest-native doctor` notes that Vitest 4 runs without the transform cache.** On Vitest 4 the
plugin leaves Vitest's persistent transform cache off, so every run transforms every imported
module again (about half a second per thousand modules on one benchmark). doctor now says so in a
"Transform cache" section, as advice that never fails the check. To get the cache, upgrade to
Vitest 5, or on Vitest 4.1 set `test.experimental.fsModuleCache: true` and mind
[vitest-dev/vitest#11789](https://github.com/vitest-dev/vitest/issues/11789). No section appears on
Vitest 5, or when the config sets `fsModuleCache: false`.
