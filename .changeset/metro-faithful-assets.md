---
"vitest-native": minor
---

Asset imports and requires evaluate to what Metro gives an app: a registered asset id

`require('./logo.png')`, `import font from './Icon.ttf'` and every other asset now evaluate to a
number — the id React Native's asset registry assigned to the asset — instead of the file's name.
The module is the one Metro generates (`module.exports = require(assetRegistryPath).registerAsset({…})`),
with the descriptor Metro's `getAssetData` produces: `name`, `type`, `scales`, `hash`,
`httpServerLocation` and, for images, `width` and `height` in points. React Native code that consumes
assets therefore behaves as on device. `Image.resolveAssetSource(require('./splash.png'))` used to
return `null`, because a file name is not a registered id, so code such as
`Image.resolveAssetSource(source)!.uri` threw.

- **Native engine.** Assets register with React Native's own registry — the module Metro's
  `assetRegistryPath` names (`react-native/asset-registry` on 0.87 and later,
  `react-native/Libraries/Image/AssetRegistry` before) — on every load path: Vite-graph imports,
  requires and imports through Node, and React Native's own image assets. `resolveAssetSource`,
  `<Image source={require(…)}>` and `AssetRegistry.getAssetByID` resolve them.
- **Mock engine.** Assets register with the mock `AssetRegistry`, and the mock
  `Image.resolveAssetSource` resolves a registered id as React Native does (the same URI the native
  engine produces, on iOS and Android). The mock `AssetRegistry` now keeps its entries across
  `resetAllMocks()`: React Native's registry has no reset, and an asset module's id must stay valid
  for every test in the file.
- **Scales and platforms.** `@2x`/`@3x` variants group as in Metro: `scales` lists them, the
  dimensions are the smallest variant's divided by its scale, and resolution picks the variant for
  the device's pixel ratio. A `.ios`/`.android` variant is preferred for the configured platform.
- **Dimensions** are read from PNG, JPEG, GIF, BMP and WebP headers, with no new dependency. SVG,
  TIFF, PSD and KTX images, which Metro also measures, and files that are not valid images register
  without `width` and `height`; Metro would fail the build on the latter.

### Upgrading

Snapshots that contained an asset's file name now contain its registered id (a number), and under
the native engine a rendered `<Image source={require('./logo.png')} />` snapshots the resolved
source (`uri`, `width`, `height`, `scale`). Ids are assigned in registration order within a test
file, so they are stable for a given file. Update affected snapshots with `vitest -u`. Assertions
that compared an asset to its file name can compare `Image.resolveAssetSource(asset).uri` instead.
