# A library whose pnpm store directory names worklets loses its .native files

- **Class:** transform/resolution
- **Source:** #349 (bisected to #336: expo-router native-stack threw requireNativeViewManager on a pnpm Expo 58 app)
- **Fixed by:** #363 (merged: reverts #336, which introduced it); #349 keeps it fixed when #336 relands (`origin/fix/library-resolver-pnpm-store`)
- **Needs:** layout pnpm

## The bug

Since #336 the engine runs relative requests through reanimated's and worklets' own Jest resolvers. worklets' resolver decides by `basedir.includes('react-native-worklets')`, and pnpm names a package's store directory after its PEERS (`expo-modules-core@58…_react-native-worklets@0.13.0`), so every library peering on worklets lost `.native` resolution and loaded its web files. Hoisted installs (and this repository's bun layout) never show it.

## Expected behaviour

A library installed beside worklets in a pnpm store resolves `./platform` to `platform.native.js`.

## Cannot reproduce on current main

This exhibit no longer reaches its bug. Main pins `react-native-worklets` 0.13.1, and the
exhibit passes on main, on the build before the fix and on the fix branch alike (Proof:
NOT PROVEN). It needs the reanimated-peer shape (a library whose pnpm store directory
names `react-native-reanimated`) once #419/#444 lands and the engine runs reanimated's
own Jest support again.
