---
"vitest-native": patch
---

Fix a stale-registry hazard and restore React Native's stack frames

Two defects in the precompiled registry, both found by reviewing it adversarially
rather than by a failing test.

**The cache key ignored the boundary mocks' content.** It hashed their module *names*,
but the mocks are compiled into the registry, so changing one — a maintainer editing a
mock, or a user upgrading to a release that changed one — left the cached registry
valid and kept serving the previous behaviour with nothing to indicate it. The key now
hashes the rendered mock source, and this package's own version alongside it, covering
everything else it contributes.

**Stack frames from inside React Native lost their file.** Collapsing ~440 modules
into one file meant an RN-internal failure reported
`registry/rn-ios-<hash>.cjs:253:7638` instead of
`Libraries/Animated/nodes/AnimatedInterpolation.js` — the useful part of the frame.
The registry now emits a source map attributing every generated line to the React
Native file it came from, and enables Node's source-map support before compiling
itself. Failure output names real React Native files again, at no runtime cost.

Also relaxes the `hotRuntime` Vitest guard added alongside it: it compared resolved
paths, so a monorepo with the same Vitest version installed in two trees was refused
even though those interoperate fine. Only a version difference is an error now.
