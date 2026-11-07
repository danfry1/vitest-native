---
"vitest-native": patch
---

**`projectBabel` checks each file against the project root once per run.** Ruling out a file outside the root can take native `realpath` calls, and both the transform cache key and the load hook asked for every module. No action needed.
