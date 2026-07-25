---
"vitest-native": patch
---

The snapshot serializer no longer throws on a circular prop, and produces stable output

Three fixes to the serializer registered for every project by the plugin's setup file.

A prop holding a circular object — a navigation object, a store, anything with a
parent back-reference — raised `TypeError: Converting circular structure to JSON`, so
the test failed with a type error instead of producing a snapshot. Cycles now print
as `[Circular]`.

Object keys inside a prop value are sorted, so two structurally equal props serialize
identically. Previously `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produced different
snapshots, and a rewrite that changed nothing could churn a snapshot file. Prop names
were already sorted; this applies the same rule inside values. Array order is
preserved, since it is meaningful.

Functions and `undefined` nested inside a prop are shown rather than dropped:
`{ onPress: fn }` used to print as `{}`, an empty object that reads like missing data.

Non-element children are also indented one level less, matching sibling elements.
