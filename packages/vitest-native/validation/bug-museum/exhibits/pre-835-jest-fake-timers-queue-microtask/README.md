# jest.useFakeTimers() leaves queueMicrotask real under jest-compat

- **Class:** env-contract
- **Source:** #835
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

Jest's modern fake timers fake `queueMicrotask`. jest-compat's `jest.useFakeTimers()` kept it real, as Vitest does. A callback queued with it ran right away instead of when the timers ran. react-native-worklets' Jest mock reports `runOnJS` and `scheduleOnRN` calls this way, so an animation's completion callback fired on mount.

## Expected behaviour

After `jest.useFakeTimers()`, a `queueMicrotask` callback runs when the timers run (`jest.runAllTimers()`), as under Jest. `jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })` keeps it real.
