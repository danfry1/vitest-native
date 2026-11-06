---
"vitest-native": minor
---

**jest-compat supports `jest.replaceProperty()`.** `jest.replaceProperty(Platform, 'OS', 'android')` replaces the value in place, as Jest does. It used to throw. The returned handle has `replaceValue()` and `restore()`. `jest.restoreAllMocks()`, the `restoreMocks` setting and the end of the test file also restore it, and it throws Jest's errors for a getter, a function or a missing property.

No action needed.
