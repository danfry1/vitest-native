# One regex alias covering every workspace package cannot be loaded

- **Class:** ownership
- **Source:** #344 review (#344 still fails it)
- **Fixed by:** open (#344 does not fix it; v2 ownership by resolution) (`origin/fix/source-aliased-workspace-ownership`)
- **Needs:** nothing beyond this repository's install

## The bug

The engine detects a workspace member that declares React Native and hands its directory
to Node (externalization). When the app's config points that package at its SOURCE, the
library's own import of a second workspace package is then evaluated by Node, while the
test imports the same file through Vite: two instances of one module, and a store
written through one path is not seen through the other. Silent: no error, wrong values.

Matching aliases by their text cannot see which package a single catch-all regex points at, so #344 still hands the directory to Node.

## Expected behaviour

One module instance: the value the test writes through one import path reads back through the other.
