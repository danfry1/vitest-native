---
"vitest-native": patch
---

Scope the native transformer's toolchain to the project root instead of the process

The transformer resolved its toolchain — `@react-native/babel-preset`,
`@babel/core`, the flow-enums plugin, and the disk-cache directory — into module
globals initialized by the first caller. `transformRN` accepts a project root per
call, but a second root's calls silently reused the first root's resolved
toolchain and cache. Registries for every project in a Vitest workspace are built
in the one Vite main process, so two projects with different React Native or
Babel versions could serve the first project's output to the second project's
tests.

Proven before fixing: a regression test gives two roots their own Babel preset
whose plugin stamps a root-specific marker into every transformed file, and the
second root's file came back carrying the first root's stamp. Toolchain state now
lives in a per-root context — resolved requires, preset, lazily-loaded Babel,
in-memory cache, and disk-cache directory each belong to one canonical (realpath)
project root — and the same test asserts both call orders plus per-root cache
directories.
