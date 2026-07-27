---
"vitest-native": patch
---

Report when a package resolves to two different files across the two module systems

The native engine runs two resolvers: Vite resolves the test graph, and Node's CJS
resolver serves everything externalized. The plugin points Vite at React Native's
fields — `react-native`, `module`, `jsnext:main`, `jsnext` — and `main`, which is all
Node's resolver consults, is not among them.

Any package publishing a `react-native` field, which is ordinary across the ecosystem,
or a `module` field, which is ordinary for anything dual-format, therefore resolves to
a different file on each side. When both graphs load it the package exists twice, with
separate module-level state, and nothing says so: a store written through one copy
reads back unset through the other, so values arrive empty and the failure surfaces far
from its cause.

The Node-side resolver now compares each package it resolves against the file Vite's
field order would choose, and reports the pair once per package when they differ,
naming the field responsible and what diverging state means. It does not fire on a
suite where the two agree.

This is a diagnostic, not a fix: making the two resolvers agree is a separate change.
