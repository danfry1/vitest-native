# A workspace library aliased to a source FILE loads twice

- **Class:** ownership
- **Source:** #344 review; ownership-ledger shape 2
- **Fixed by:** #344 (draft; ownership by resolution is planned for v2) (`origin/fix/source-aliased-workspace-ownership`)
- **Needs:** nothing beyond this repository's install

## The bug

The engine detects a workspace member that declares React Native and hands its directory
to Node (externalization). When the app's config points that package at its SOURCE, the
library's own import of a second workspace package is then evaluated by Node, while the
test imports the same file through Vite: two instances of one module, and a store
written through one path is not seen through the other. Silent: no error, wrong values.

## Expected behaviour

One module instance: the value the test writes through one import path reads back through the other.
