---
"vitest-native": patch
---

**`vitest-native doctor` notes that Vitest 4 runs without the transform cache.** On Vitest 4 the
plugin leaves Vitest's persistent transform cache off, so every run transforms every imported
module again (about half a second per thousand modules on one benchmark). doctor now says so in a
"Transform cache" section that never fails the check. To get the cache, upgrade to Vitest 5, or
from Vitest 4.0.11 set `test.experimental.fsModuleCache: true` after reading the troubleshooting
entry on [vitest-dev/vitest#11789](https://github.com/vitest-dev/vitest/issues/11789) (reproduced
on 5.0.5, unverified on 4). doctor also flags a top-level `test.fsModuleCache`, which does nothing on 4.
