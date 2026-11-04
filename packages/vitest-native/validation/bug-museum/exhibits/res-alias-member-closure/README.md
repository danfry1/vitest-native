# A workspace library's dependencies are not compiled for a package that imports it through an alias

- **Class:** transform/resolution
- **Source:** a monorepo package that imports a sibling workspace library's source through `resolve.alias` without declaring it; the library declares expo-image, an app package declares expo
- **Fixed by:** fix/closure-seed-reached-packages
- **Needs:** nothing beyond this repository's install

## The bug

The engine compiles the dependencies of the React Native packages a run reaches (the closure walk). The walk started only from detected packages the project itself declares. Here the project declares nothing and imports the workspace library museum-ui through `resolve.alias`; museum-ui is not detected (its owner stays Vite, as in 0.14.0-rc.10), so nothing it depends on was walked: museum-image and museum-expo are detected through the workspace's other manifests, but museum-expo-asset, reached only through museum-expo's own dependencies, was never compiled, and Node ran its ES module build as published.

## Expected behaviour

The alias target's workspace library is reached, and its dependencies seed the walk, so museum-expo-asset is compiled and the test passes, while museum-ui itself stays the project's own source.
