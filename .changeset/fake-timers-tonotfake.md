---
"vitest-native": patch
---

**`jest.useFakeTimers()` works in a project that sets `test.fakeTimers.toNotFake`.** Calls with `doNotFake` or `legacyFakeTimers` threw "config.toFake and config.toNotFake cannot be used together". They now run, and a call's `doNotFake` replaces the project's list, as a call's `doNotFake` replaces the project's in Jest. The project's `fakeTimers` is read from the config Vitest resolved, so a workspace project that inherits it is covered too.
