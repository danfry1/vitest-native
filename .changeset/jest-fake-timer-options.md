---
"vitest-native": patch
---

**Under `vitest-native/jest-compat`, `jest.useFakeTimers(options)` honours Jest's options.** No action needed. If a suite depended on a date set with `setSystemTime` carrying into the next test, pass `now` to `jest.useFakeTimers()`.

Before, the options went to `vi.useFakeTimers`, which ignores Jest-only keys, so `{ advanceTimers: true }` never advanced and `doNotFake` faked the named APIs anyway. They are now translated as Jest 30 translates them: `advanceTimers` (`true` or a step in ms), `doNotFake`, `now`, and `timerLimit` (Jest's default of 100,000). As in Jest, each call starts the clock at the real time unless given `now`. `legacyFakeTimers: true` fakes only the timer functions, leaves `Date` real, and warns once that assertions on the timer functions are not supported. `jest.useFakeTimers()` and `jest.useRealTimers()` return `jest`, so calls chain. `process.nextTick` and `queueMicrotask` stay real, as under `vi.useFakeTimers`.

Options given at the top level of a setup file are lost once React Native Testing Library loads; call `jest.useFakeTimers()` in a `beforeEach`, or use Vitest's `test.fakeTimers`. The migration guide now explains why Jest's `.snap` files cannot be shared with Vitest and how to keep each runner's snapshots apart with `resolveSnapshotPath`.
