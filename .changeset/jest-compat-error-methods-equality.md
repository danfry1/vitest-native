---
"vitest-native": patch
---

Under the jest-compat setup, two errors that differ only in the methods their class assigns as instance fields are equal. zod 3's `ZodError` assigns `addIssue` and `addIssues` as arrow functions in its constructor, and Vitest compares an error's own properties, so two identical `ZodError`s never matched: `toEqual`, `rejects.toEqual` and `toThrow(error)` failed with "Compared values have no visual difference", where Jest passes. Only an own property that is a function on both errors is ignored; name, message, cause, `AggregateError` errors, other own properties and `toStrictEqual`'s type check are compared as Vitest compares them, so it does not accept the mismatches a message-only comparison would, such as `toStrictEqual` between a `TypeError` and an `Error`, or `toThrow` with a different cause. The setup's `expect` is shared, so Vitest-style assertions in the same project get the same comparison.
