---
"vitest-native": patch
---

**When projects in one `sequence.groupOrder` run different worker counts, the hot-runtime-off message now recommends the same `test.maxWorkers` for every project.** It used to suggest a separate `groupOrder`, which makes every project in the earlier group finish before any file in the later group starts. That is still named, as the alternative, with its cost. When the memory plan lowered only the hot project's count, the message says so and names the count it admitted, so you can pick a count the smallest machine you run on admits. The message links the [hot runtime guide](https://vitest-native.danfry.dev/guide/hot-runtime#react-native-and-other-projects-in-one-run). No action needed.
