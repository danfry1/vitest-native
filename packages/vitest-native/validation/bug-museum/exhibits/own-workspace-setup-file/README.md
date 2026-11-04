# A setup file inside a Node-owned workspace library is refused

- **Class:** ownership
- **Source:** 0.14.0-rc.11 regression testing
- **Fixed by:** #427 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

An app lists a sibling workspace library's own `vitest.setup.ts` in `test.setupFiles`.
The library declares react-native and exports `./package.json`, so the engine detects it
and assigns its directory to Node. Vitest runs every setup file in Vite whatever the
external patterns say, and the ownership check in Vite's transform then refuses the setup
file with `MODULE_OWNER_CONFLICT` before any test runs. This has been so since the
ownership policy landed (#220).

`own-workspace-unexported-manifest` is the same layout with an exports map that leaves out
`./package.json`, which 0.14.0-rc.11 began to detect.

## Expected behaviour

The setup file runs in Vite, as an entry. The library's source stays with Node, so the
test and the setup file share its one instance: the test sees what the setup file wrote.
