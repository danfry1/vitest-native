---
"vitest-native": patch
---

`jest.useFakeTimers(options)` under jest-compat now honours Jest's options. It used to pass them to `vi.useFakeTimers`, which ignores Jest-only keys, so `{ advanceTimers: true }` never advanced and `doNotFake` faked the named APIs anyway. The options are translated as Jest translates them: `advanceTimers` (a flag or a step in ms), `doNotFake`, `now`, and `timerLimit`, with Jest's default limit of 100,000 timers. `legacyFakeTimers: true` runs modern fake timers over the timer functions and leaves `Date` real, and warns once that assertions on the timer functions are not supported. `jest.useFakeTimers()` and `jest.useRealTimers()` return the `jest` object, so calls chain as in Jest. `process.nextTick` and `queueMicrotask` stay real, as they do under `vi.useFakeTimers`.
