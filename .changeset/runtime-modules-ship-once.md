---
"vitest-native": patch
---

**The install is smaller: each runtime module ships once.** Fourteen runtime modules (such as
`errors.mjs`, `native/transform.mjs` and `native/ownership.mjs`) shipped as files and were also
copied into the bundled entry points. The entry points now import the shipped files, which takes
about 18 KB packed and 63 KB unpacked off the package and leaves one instance of each module per
process. No action needed. The CommonJS build of `vitest-native/helpers` now loads `errors.mjs`
through `require(esm)`, which every Node version in `engines` provides.
