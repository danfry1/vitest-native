# A library whose pnpm store directory names reanimated loses its .native files

- **Class:** transform/resolution
- **Source:** #349 (bisected to #336: expo-router native-stack threw requireNativeViewManager on a pnpm Expo 58 app); reshaped for reanimated's resolver once #419's library Jest resolvers are in the engine
- **Fixed by:** the engine consulting a library's own Jest resolver only for that library's own files (97183394, in the Track B stack); #363 reverted the first form (#336)
- **Needs:** layout pnpm

## The bug

The engine runs relative requests through reanimated's and worklets' own Jest resolvers, which narrow a file's extensions to their JS implementation. reanimated's resolver decides by `basedir.includes('react-native-reanimated')`, and pnpm names a package's store directory after its PEERS (`museum-peer-lib@1.0.0_react-native-reanimated@4.7.1`). So a library peering on reanimated lost `.native` resolution and loaded its web files. Hoisted installs (and this repository's bun layout) never show it.

The first form of this exhibit peered on worklets; since main pins worklets 0.13.1, whose resolver no longer narrows that way, only reanimated's check is a live risk.

## Expected behaviour

A library installed beside reanimated in a pnpm store resolves `./util` to `util.native.js`.
