---
"vitest-native": patch
---

Compile a detected package's dependencies too

`react-native-modal` — and any package like it — failed to import under the native
engine with a bare `SyntaxError: Unexpected token '<'`, naming no file and no package.

Detection asks each package's own manifest whether it declares `react-native`. The
untranspiled JSX was not in `react-native-modal`; it was in `react-native-animatable`,
which that package depends on. Nothing in the project declares it, so it was never a
candidate, and it names `react-native` in neither `dependencies` nor
`peerDependencies`, so the manifest test would have rejected it anyway. The documented
remedy, `transform: ['react-native-modal']`, does not help — only naming
`react-native-animatable` does, and nothing told anyone that.

A detected package's dependency closure is now compiled with it. Two exclusions keep
that safe, and both compute themselves rather than being lists to maintain:

- **React Native's own dependencies.** The precompiled registry reaches those through
  pre-resolved absolute paths, so Node owns them; inlining one would give the same
  package two owners and two instances.
- **The transform's own toolchain closure.** The transform runs `@babel/core`, so
  inlining anything Babel reaches means loading it re-enters the transform while Babel
  is mid-load.

Detection stays under a millisecond, and 120 isolated test files run in the same time
as before.
