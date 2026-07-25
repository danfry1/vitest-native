---
"vitest-native": minor
---

`hotRuntime` now isolates modules per file instead of repairing them

A hot worker stays alive across test files, which is where its speed comes from —
a fresh worker costs roughly 200ms of boot, and that dominates a run at scale. What
it kept along with the worker was state: everything Vitest externalizes lives in
Node's require cache, outside the reach of Vitest's own per-file reset.

The previous model kept those modules resident and undid their damage afterwards,
from a boot snapshot plus a call-stack heuristic that attributed each listener to
import phase or test phase. That was approximate by construction, and wrong for a
whole class: a `node_modules` singleton mutated by one file stayed mutated for the
next, where stock isolation gives every file a fresh copy.

The engine now re-executes instead of repairing. Anything the worker loaded to
bootstrap itself stays; anything a test file caused to load is dropped and runs again
on the next file. That is affordable because of the precompiled registry —
re-instantiating React Native costs about 4ms in a warm worker.

Measured: the idiomatic parity suite runs 135/135 under both engines with zero
hot-specific failures, at 11.1× the default engine's speed; against Jest at 200 files,
2.54× with 3.4× less peak memory.

React, the renderers and `@testing-library/react-native` stay resident deliberately.
Test files reach them through ESM `import`, which caches them in a registry Node
offers no way to invalidate, so dropping the CommonJS entry would not replace them —
it would add a second copy, and the two halves of the test stack would stop
recognising each other.

**Known limit.** A package a test file `import`s, rather than `require`s, cannot be
evicted; only the CommonJS cache can be reset. Packages the engine inlines are
unaffected, since those live in Vitest's own graph.

`hotRuntime` remains opt-in. Making it the default needs validation against real
applications, not only this repository's suites.
