# A workspace library aliased to source under another name loads twice

- **Class:** ownership
- **Source:** #344 (`monorepo-source-ownership.test.ts`, the renamed-alias case)
- **Fixed by:** #371 (merged); a guard for the shape #344 tested
- **Needs:** nothing beyond this repository's install

## The bug

The engine detects a workspace member that declares React Native and hands its directory
to Node (externalization). Here the app points that package at its SOURCE under an alias
that is not the package's name: `@feat` → `packages/feature/src`, while the package is
`@m/feature`. Ownership therefore has to follow the alias's target directory, not its
name. Before #371 it did not: the library's own import of a second workspace package was
evaluated by Node while the test imported the same file through Vite, so a store written
through one path read back unset through the other. Silent: no error, wrong values.

## Expected behaviour

One module instance: the value the test writes through one import path reads back through the other.
