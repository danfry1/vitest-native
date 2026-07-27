---
"vitest-native": patch
---

Thrown errors now carry a class and a stable code

Errors raised by the plugin were plain `Error` instances whose only identity was their
message text. They are now `VitestNativeError`, or `VitestNativeTypeError` where a
`TypeError` is the right shape, each carrying a `code` from a fixed set.

What this changes for a consumer is the `name` on the error: it reads
`VitestNativeError` rather than `Error`, and that survives Vitest's serialisation of
errors out of a worker, which keeps `name`, `message` and `stack`. The `code` is
readable on errors thrown in the Vite main process — configuration and resolution
failures — but is an own property, so it does not survive that same serialisation for
errors raised inside a worker.

The classes and an `isVitestNativeError` guard are not importable from the package:
there is no `vitest-native/errors` entry point, and the main entry does not re-export
them. Adding one is a separate decision, since it is a twelfth public export path to
support, and it would also let the bundled entries self-reference `errors.mjs` instead
of carrying a second copy of it.
