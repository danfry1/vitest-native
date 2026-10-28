# A library whose pnpm store directory names worklets loses its .native files

- **Class:** transform/resolution
- **Source:** #349 (bisected to #336: expo-router native-stack threw requireNativeViewManager on a pnpm Expo 58 app)
- **Fixed by:** #349 (`origin/fix/library-resolver-pnpm-store`)
- **Needs:** layout pnpm

## The bug

Since #336 the engine runs relative requests through reanimated's and worklets' own Jest resolvers. worklets' resolver decides by `basedir.includes('react-native-worklets')`, and pnpm names a package's store directory after its PEERS (`expo-modules-core@58…_react-native-worklets@0.13.0`), so every library peering on worklets lost `.native` resolution and loaded its web files. Hoisted installs (and this repository's bun layout) never show it.

## Expected behaviour

A library installed beside worklets in a pnpm store resolves `./platform` to `platform.native.js`.
