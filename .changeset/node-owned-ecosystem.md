---
"vitest-native": patch
---

Give React Native ecosystem packages a single owner

The native engine runs two module systems: Vite resolves the test graph, and Node's
CJS resolver serves everything externalized. Auto-detected ecosystem packages were
inlined, so Vite executed them — which left Node either unable to load them at all,
or holding a second copy with its own module-level state.

The second case is the dangerous one. Nothing fails: a store configured through one
copy simply reads back unset through the other, so a translated label renders as an
empty string and the test compares empty output against expected text with nothing
pointing at the cause.

They are now externalized and transformed by the Node hooks, exactly as React Native
itself already is, so one graph owns them and a single instance follows from the
design rather than from Vitest's externalization heuristics.

Both properties inlining provided are kept, and were measured rather than assumed:
`vi.mock()` still intercepts these packages, and their module state still resets
between test files. Node can now also load them at all — previously a `require` of
an ecosystem package failed on its untranspiled source, since the hooks transformed
only React Native and the packages named in `transform`.
