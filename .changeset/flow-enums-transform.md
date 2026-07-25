---
"vitest-native": patch
---

Flow enums are no longer dropped by the native engine's transform

React Native's Babel preset carries both `@babel/plugin-transform-flow-strip-types` and
`babel-plugin-transform-flow-enums`, but in separate `overrides` entries that Babel
merges into a single pass with strip-types first. It therefore deleted `export enum
Foo {}` as if it were a type annotation, while leaving the code that referenced `Foo`
in place — a module that loaded cleanly and threw `ReferenceError` on a path nothing
had warned about. In React Native 0.86 this made `VirtualViewMode` and
`VirtualViewRenderState` undefined when imported from `react-native`.

The enum plugin now runs ahead of the preset, which Babel's plugin/preset ordering
guarantees. Measured identical on preset 0.85.3 and 0.86.1, so this is the preset's
ordering rather than a version mismatch.

The precompiled registry's cache key now includes the transform's version too. It
stores transformed module source, and neither the preset version, the Babel version nor
the package version changes when the transform's own configuration does — so a warm
registry would have kept serving modules built before this fix.
