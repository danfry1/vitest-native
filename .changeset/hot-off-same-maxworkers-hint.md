---
"vitest-native": patch
---

**When projects in one `sequence.groupOrder` run different worker counts, the hot-runtime-off message now recommends the same `test.maxWorkers` for every project.** It used to suggest a separate `groupOrder`, which runs the groups one after another; that is now the named alternative. When the memory plan lowered only the hot project's count, the message names the admitted count. When `--maxWorkers` or `VITEST_MAX_WORKERS` set the count, it asks for a value no higher than that. `hotRuntime: true` gives the same single remedy in `HOT_RUNTIME_OVERRIDDEN`. See the [hot runtime guide](https://vitest-native.danfry.dev/guide/hot-runtime#react-native-and-other-projects-in-one-run). No action needed.
