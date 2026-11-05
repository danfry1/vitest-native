# A workspace library's dependencies are not compiled for a package that imports it through a RegExp alias

- **Class:** transform/resolution
- **Source:** a monorepo package that imports a sibling workspace library's source through a `resolve.alias` entry whose `find` is a RegExp, without declaring the library; the library declares expo-image, an app package declares expo
- **Fixed by:** open (fix/regex-alias-closure-seed)
- **Needs:** nothing beyond this repository's install

## The bug

#433 made a workspace library that the run reaches through `resolve.alias` seed the closure walk ([res-alias-member-closure](../res-alias-member-closure/README.md)). The targets came from the jest-compat layer's alias list, which keeps only entries with a string `find`, because `jest.requireActual` cannot apply a RegExp. So an alias like `{ find: /^@ui\/(.*)$/, replacement: '<abs>/packages/ui/$1' }` reached nothing: museum-ui's dependencies were not walked, museum-expo-asset (reached only through museum-expo's own dependencies) was never compiled, and Node ran its ES module build as published.

## Expected behaviour

Every `resolve.alias` entry seeds the walk through the workspace member its replacement points into, whatever its `find` is. The fixed part of the replacement (before `$1`) lies inside museum-ui, so museum-expo-asset is compiled and the test passes, while museum-ui itself stays the project's own source.
