---
"vitest-native": patch
---

`resetAllMocks()` now resets every stateful mock, including `NativeAppEventEmitter`

The helper reset a hand-written list of seven mocks. `NativeAppEventEmitter` is a
second event-emitter instance — the mock registry builds one per name, so it is not
the same object as `DeviceEventEmitter` — and it was not on the list. A listener
registered on it survived `resetAllMocks()` and fired again in the next test.

The helper now resets every mock that exposes a `_reset`, so a stateful mock added
later is covered on arrival rather than needing to be remembered here.
