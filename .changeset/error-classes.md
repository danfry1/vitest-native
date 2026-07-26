---
"vitest-native": patch
---

Thrown errors now carry a class and a stable code

Errors raised by the plugin were plain `Error` instances whose only identity was their
message text, so a consumer catching one had nothing to match on but a string that is
free to change. They are now `VitestNativeError` (or `VitestNativeTypeError`, where a
`TypeError` is the right shape) with a `code` from a documented set, exported for
typed use alongside an `isVitestNativeError` guard.

Vitest serialises errors across the worker boundary by name, message and stack, so the
guard checks the name and code rather than using `instanceof`, which does not survive
that crossing.
