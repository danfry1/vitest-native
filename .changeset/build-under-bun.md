---
"vitest-native": patch
---

Build with tsdown under bun's runtime

tsdown's bin declares a Node shebang, and from 0.22 it calls `Promise.withResolvers` —
an API Node did not ship until 21. Building on Node 20 therefore failed with
`TypeError: Promise.withResolvers is not a function`, which blocked the dev-dependency
updates that carry tsdown forward.

`build` now invokes `bunx --bun tsdown`, so the bundler runs under bun's runtime, which
has the API. The emitted `dist` is byte-identical either way, verified by hashing it
from both runtimes against tsdown 0.21 and 0.22.

This is a change to what the build toolchain runs on, not to what the package requires.
The published `engines` floor of Node >= 20.19 is unchanged, and the Node 20 CI legs —
which prove that floor and pin RNTL 12 and 13 as the lower-bound back-compat corners —
keep running everything they ran before.
