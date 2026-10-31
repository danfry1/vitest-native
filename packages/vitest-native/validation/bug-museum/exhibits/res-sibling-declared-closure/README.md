# A sibling-declared package's dependencies are not compiled when the run reaches it

- **Class:** transform/resolution
- **Source:** an Expo workspace whose library declares expo-image and whose app declares expo: "Cannot find module 'expo-asset/build/Asset.fx'" (SDK 58's expo, expo-asset and expo-constants have this shape)
- **Fixed by:** open (`fix/closure-walk-reached-packages`)
- **Needs:** nothing beyond this repository's install (`vendor/` holds expo-image's, expo's and expo-asset's shapes)

## The bug

The closure walk compiles the dependencies of detected packages, starting from the ones the project declares. `expo` is detected on the app's declaration, so it was already in the set when the library's expo-image reached it as a peer, and the walk stopped there: expo was compiled and its own dependencies were not. expo-asset is expo's dependency and nobody's declaration, and its `build/` ES modules loaded raw, so their extensionless imports failed.

## Expected behaviour

A detected package the run reaches, through a dependency or a peer, has its dependencies walked: museum-expo-asset is compiled and its `./Asset.fx` import resolves.
