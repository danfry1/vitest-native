# A project file Node loads before the test imports it is a second instance

- **Class:** ownership
- **Source:** ownership gains attribution (2026-11): the load-order case #371 leaves open
- **Fixed by:** open (ownership track A3: the predicate)
- **Needs:** nothing beyond this repository's install

## The bug

`own-alias-string` passes since #371: when Node's `require` reaches a project file Vite
has already evaluated, the engine hands Node Vite's instance. That only works in that
order. Here the test imports the React Native workspace library first. Node evaluates
it, and its import of the second workspace package's store compiles a Node copy of the
store. The test then imports the store through Vite, which evaluates its own copy: two
instances of one module, decided by import order. Silent: no error, wrong values.

Jest has one registry, so the order of imports cannot split a module.

## Expected behaviour

One module instance whichever side loads it first: the value the test writes reads back
through the library. Ownership track A3's honest target is "share Vite's instance, or fail
by name"; a named failure would also end the silent split.

## Control

The same files with the two imports swapped (Vite first): the order #371 handles.
