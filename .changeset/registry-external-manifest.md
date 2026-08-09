---
"vitest-native": patch
---

Invalidate the React Native registry when any baked-in dependency changes, not just React

The precompiled registry inlines React Native's own graph and leaves everything else —
`react`, `invariant`, `nullthrows`, `@babel/runtime`, `stacktrace-parser` and others —
as a normal `require` at a **pre-resolved absolute path** compiled into the emitted
file. Those paths are only correct while the packages they point at stay where they
were, but only React Native's own files were pinned against change.

A previous fix named `react` in the cache key after upgrading React produced a null
React dispatcher and React Native singletons that no longer compared equal. That fixed
one package out of eleven. Naming the rest in the key one at a time would be a list
that rots — the next dependency added to React Native's graph would not be on it.

The resolved external targets are now recorded in the registry's manifest alongside
React Native's own files, so the existing size-and-mtime check covers them. That works
for both `node_modules` layouts: under bun and pnpm a version change moves the path, so
the stat fails; under a flat npm or yarn tree the path survives but the file changes.

Eleven packages are pinned in this repository's build. Verified by changing `invariant`
under a warm cache: the registry rebuilds, where before it was reused unchanged.
