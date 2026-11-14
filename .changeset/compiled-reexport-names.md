---
"vitest-native": patch
---

**`import * as X from 'lib'` now carries every part of a component library built by esbuild or tsup with JSX preserved.** The library's index re-exports a module the engine compiles, and Node read that module's names from the published file, whose JSX it could not read: the namespace held only `default`, so `X.Root` was undefined and rendering it failed with "Element type is invalid". The engine now lists the names a module re-exports from files it compiles. No action needed.
