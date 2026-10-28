# TypeScript under node_modules reached by a peer edge is handed to Node

- **Class:** transform/resolution
- **Source:** monorepo migration report #2
- **Fixed by:** #323 (merged)
- **Needs:** nothing beyond this repository's install

## The bug

The transform set is a closure over DEPENDENCIES; packages reached through PEER edges (expo-modules-core via expo-image -> expo, an animation adapter whose react-native export condition points at src/index.ts) were outside it, and the ESM loader returned them to Node: `Stripping types is currently unsupported for files under node_modules`.

## Expected behaviour

An installed ES module importing a TypeScript-source package it only peers on loads, its enum included.
