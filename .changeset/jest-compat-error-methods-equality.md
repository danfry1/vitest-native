---
"vitest-native": patch
---

**Under `vitest-native/jest-compat`, two errors that differ only in per-instance methods are equal, so identical zod 3 `ZodError`s match.** No action needed.

zod 3's `ZodError` assigns `addIssue` and `addIssues` as arrow functions in its constructor, and Vitest compares an error's own properties, so `toEqual`, `rejects.toEqual` and `toThrow(error)` failed with "Compared values have no visual difference" where Jest passes. Now an own property that is a function on both errors is ignored. Everything else is compared as before: name, message, `cause`, `AggregateError`'s `errors`, other own properties, and `toStrictEqual`'s type check. So `toStrictEqual` between a `TypeError` and an `Error`, or `toThrow` with a different `cause`, still fails.

The jest-compat `expect` is shared, so Vitest-style assertions in the same project get the same comparison.
