# A workspace library whose exports omit ./package.json leaves Vite

- **Class:** ownership
- **Source:** 0.14.0-rc.11 regression
- **Fixed by:** open (`fix/workspace-package-ownership`)
- **Needs:** nothing beyond this repository's install

## The bug

#406 (0.14.0-rc.11) taught detection to find a package whose `exports` map leaves out
`./package.json`, for installed packages such as expo-symbols. It applied to workspace
members too. A workspace library declaring react-native with such an exports map, which
ran in Vite on rc.10, became Node-owned. Its setup file was refused with
`MODULE_OWNER_CONFLICT`. With that refusal fixed alone, `vi.mock` in the setup file no longer
reached the library's own imports, and its helper that imports `vitest` failed under Node.

## Expected behaviour

As on 0.14.0-rc.10: the library is not detected and runs in Vite. The setup file's
store write, its `vitest` helper and its `vi.mock` of a library module all reach the test.
