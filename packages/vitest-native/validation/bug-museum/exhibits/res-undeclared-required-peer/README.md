# A required React Native peer that nothing declares is not compiled

- **Class:** transform/resolution
- **Source:** #296 and #508. An Expo app declares expo-router but not expo-linking, its required peer, which pnpm installs itself. expo-router's compiled `require('expo-linking')` reached expo-linking's published ES module build: "Cannot require() ES Module …/expo-linking/build/Linking.js because it is not yet fully loaded", and on that path "Cannot find module …/Linking.types" (#506).
- **Fixed by:** open (#508)
- **Needs:** nothing beyond this repository's install (`vendor/` holds expo-router's and expo-linking's shapes)

## The bug

The engine chooses packages to compile from the names the project declares, and follows a peer only into a package it already chose. A required peer that nobody declares is installed by the package manager and loaded by the package that needs it, but was never compiled: its `build/` ES modules loaded raw, and their extensionless import failed.

## Expected behaviour

A required React Native peer installed beside a compiled package is compiled too. An optional peer is not followed (expo's and expo-router's web peers): following those grew one Expo app from 157 to 206 compiled packages.
