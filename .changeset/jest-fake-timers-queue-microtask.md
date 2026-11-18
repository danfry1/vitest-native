---
"vitest-native": minor
---

**jest-compat's `jest.useFakeTimers()` fakes `queueMicrotask`, as Jest does.** A callback queued with it, such as a `scheduleOnRN` call through react-native-worklets' Jest mock, now runs when the timers run instead of at once. `process.nextTick` stays real. A project whose `test.fakeTimers` sets `toFake` or `toNotFake` keeps its own list. To keep the old behaviour, call `jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })`.
