---
"vitest-native": minor
---

Presets no longer declare named exports the real package does not have

A preset shadows a package: under the native engine the real source never loads, so
whatever the preset lists in `exports` becomes that module's named-export surface.
Four presets declared names the real package has never exported, which made the mock
more permissive than reality — code importing those names passed under vitest-native
and failed under Metro, the one divergence a green run cannot reveal.

- `expo-constants` declared twelve properties of the default `Constants` object
  (`expoConfig`, `isDevice`, `manifest`, …) as named exports. They are now reachable
  only on the default, as in the real package, and the three enums the package really
  does export — `AppOwnership`, `ExecutionEnvironment`, `UserInterfaceIdiom` — are
  provided instead.
- `react-native-reanimated` declared `View`, `Text`, `Image`, `ScrollView` and
  `FlatList`. These are properties of the default export (`Animated.View`) and remain
  available there.
- `react-native-safe-area-context` declared `EdgeInsets`, `Rect` and `Metrics`, which
  are interfaces with no runtime binding.
- `@shopify/flash-list` declared `ViewToken`, also an interface.

A test now reads each preset package's real runtime surface with the TypeScript
checker and fails when a preset declares a name that surface lacks. Names removed by
a newer major of a package are kept deliberately, since presets are not pinned to one
major; each is listed with the version it belongs to, and a stale entry that the
package has regained is itself a failure.

Suites that imported the removed names will need to read them from the default export
or drop them — the same change their production code needs.
