---
"vitest-native": patch
---

Only walk the dependency closure of packages the project declares

Fixes a regression in 0.11.0. In a workspace holding both a library and a React
Native or Expo application — the canonical monorepo shape — the application's mere
presence could stop the library's tests from loading:

```
ReferenceError: [vitest-native] Failed to transform '@babel/runtime' … for platform 'ios'.
Caused by: ReferenceError: Cannot access 'v' before initialization
Test Files 1 failed | Tests: no tests
```

0.11.0 began compiling a detected package's dependency closure, so that a library
shipping untranspiled JSX inside a transitive dependency would work without naming it
in `transform: [...]`. Candidates are collected from every manifest in the workspace,
which is how a library the application depends on is found at all — but applied to a
closure walk, that breadth stops being free. A sibling Expo application is detected on
its own manifest, and walking its dependencies pulled the entire Expo and Metro
toolchain into the Babel transform set of a package that depends on none of it: over
250 packages in a two-package reproduction, `@babel/runtime` and Metro's `lru-cache`
chain among them.

Those are not inert. React Native and Babel load them, and compiling the transform's
own toolchain re-enters Babel while it is still initialising — which surfaces as a
`Cannot access 'v' before initialization` naming files the project never mentioned.
The existing toolchain exclusion covers what `@babel/core` reaches and so did not
catch either of them.

The closure now starts only from packages the run itself declares — the package under
test, and any manifest above it, which is where a workspace keeping its React Native
libraries at the repository root declares them. A package only a sibling declares is
that sibling's business. Transitive compilation is unaffected: a dependency reached
through the walk is declared by its own parent, which is what makes it transitive.

Declaration rather than resolvability, deliberately: under pnpm every workspace member
is linked into a hidden directory placed on `NODE_PATH`, so a sibling's dependencies
do resolve from the package under test at run time, and testing reachability instead
lets all of them straight back through.

In the two-package reproduction the transform set drops from 253 packages to 5 — the
declared dependency and its genuine closure.
