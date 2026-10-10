---
"vitest-native": patch
---

The reanimated preset's animation builders keep chaining after `vi.resetAllMocks()` or `mockReset: true`, so `LinearTransition.springify().damping(20)` and `SharedTransition.duration(300).custom(...)` no longer throw.
