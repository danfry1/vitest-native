---
"vitest-native": patch
---

Switch a single auto-detected preset off with `presets: { name: false }`

`presets` accepted only an array, and providing one replaced auto-detection entirely.
A project that needed to drop one preset — for example the navigation preset, because
its stub means a real `NavigationContainer` never fires `onReady` — had to enumerate
every other detected preset by hand. That list then rots silently as dependencies
change: add a library and its preset is not applied, because the hand-written array
does not mention it.

Passing an object keeps auto-detection and names only what to drop. The array form is
unchanged.
