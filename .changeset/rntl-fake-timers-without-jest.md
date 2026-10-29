---
"vitest-native": patch
---

**RNTL's `findBy*` and `waitFor` advance `vi.useFakeTimers()` without jest-compat.** Under the native engine, stock and hot runtime, RNTL 12, 13 and 14 now advance Vitest's fake clock, where they used to wait in real time until they timed out. `userEvent` delays advance it too. No action needed. If you were calling `vi.advanceTimersByTime` before a query as a workaround, you can drop it.

**A setup file that calls `vi.useFakeTimers()` no longer hangs RNTL.** RNTL loaded while fake timers were on captured the fake `setImmediate`, so its auto-cleanup after each test never finished. It now captures the real one, as under Jest.

RNTL's own files get a `jest` with five timer calls backed by `vi`, and `globalThis.jest` is still not defined. Tests that do not use fake timers keep RNTL's real-timer path. With fake timers, RNTL behaves as it does under Jest:

- A `setTimeout` replaced by a mock function (`vi.spyOn(globalThis, "setTimeout")`) counts as fake timers, so `waitFor`'s timeout runs in fake time.
- Loading RNTL while fake timers are on reinstalls them with the project's `fakeTimers` config, dropping per-call options, the system time and pending timers. Under the hot runtime this happens only in the first file that loads RNTL (see Troubleshooting).

The mock engine is unchanged.
