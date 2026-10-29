---
"vitest-native": patch
---

**On Node 26, a library loaded again in each test file is no longer resolved again each time.** No action needed. Node 26 passes a plain `require` the options `{ paths: undefined, conditions }`. The resolution memo treated the unset `paths` as a `require.resolve` with `paths` and left every such request to Node, so it saved nothing on Node 26. An unset option is now ignored; a `require.resolve` with `paths` set is still left to Node.
