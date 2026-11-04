# A workspace library's dependencies are not compiled for the package that uses it

- **Class:** transform/resolution
- **Source:** a monorepo whose feature package depends on a workspace UI library that declares expo-image, with expo declared by an app package ("Cannot find module '…/expo-asset/build/Asset.fx'"); the packed Expo pnpm suite's `feature` package has this shape
- **Fixed by:** fix/closure-seed-reached-packages
- **Needs:** nothing beyond this repository's install

## The bug

The engine compiles the dependencies of the React Native packages a run reaches (the closure walk). The walk started only from detected packages the project itself declares. Here the project declares only the workspace library museum-ui, which is not detected (its owner stays Vite, as in 0.14.0-rc.10), so nothing it depends on was walked: museum-image and museum-expo are detected through the workspace's other manifests, but museum-expo-asset, reached only through museum-expo's own dependencies, was never compiled, and Node ran its ES module build as published.

## Expected behaviour

The workspace library's dependencies seed the walk, so museum-expo-asset is compiled and the test passes, while museum-ui itself stays the project's own source.
