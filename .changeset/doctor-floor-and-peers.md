---
"vitest-native": patch
---

`doctor` reports the real Node floor, and catches RNTL 14's missing peer

Two cases where `doctor` said a project was fine while it was not.

**The Node floor was hardcoded and compared on the major only.** It printed
"floor: 20" and passed any Node 20.x, but the real floor moved to 20.19 — the version
that added `require(esm)`, which the root entry point now depends on. Node 20.0 through
20.18 were reported as supported. The floor is now read from this package's own
`engines.node`, and compared as major and minor.

**RNTL 14 declares `test-renderer` as a non-optional peer** and reconciles through it.
Installing RNTL 14 without it is easy — npm only warns, and any `--legacy-peer-deps`
install is silent — and the result is that every `render()` throws `Cannot find module
'test-renderer'`, naming no file and no package. `doctor` reported no blocking problems
for exactly that project. It now fails with the install command. RNTL 13 is unaffected
and is not asked for the package it does not use.
