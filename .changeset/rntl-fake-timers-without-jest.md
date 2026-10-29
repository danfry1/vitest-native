---
"vitest-native": patch
---

**RNTL's `findBy*` and `waitFor` advance `vi.useFakeTimers()` without jest-compat.** Under the native engine, stock and hot runtime, RNTL 12, 13 and 14 now advance Vitest's fake clock, where they used to wait in real time until they timed out. `userEvent` delays advance it too. No action needed. If you were calling `vi.advanceTimersByTime` before a query as a workaround, you can drop it. RNTL's own files get a `jest` with five timer calls backed by `vi`, and `globalThis.jest` is still not defined. Tests that do not use fake timers keep RNTL's real-timer path. With fake timers, RNTL behaves as it does under Jest: a `setTimeout` replaced by a mock function (`vi.spyOn(globalThis, "setTimeout")`) counts as fake timers, so `waitFor`'s timeout runs in fake time. The mock engine is unchanged.
