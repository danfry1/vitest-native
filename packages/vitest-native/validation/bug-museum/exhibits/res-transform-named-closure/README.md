# A package named in transform no longer has its dependencies compiled

- **Class:** transform/resolution
- **Source:** react-native-flash-message named in `transform: [...]` (as projects written before detection list it): its dependency react-native-iphone-screen-helper read `Platform.OS` from undefined
- **Fixed by:** open (`fix/closure-walk-reached-packages`)
- **Needs:** nothing beyond this repository's install

## The bug

A package named in `transform` is skipped by detection, since the option already compiles it, and that also kept it out of the closure walk. Detection would have walked react-native-flash-message's dependencies; naming it explicitly left react-native-iphone-screen-helper, an ES module that imports from react-native, uncompiled, and Node's ES module loader bound `Platform` to nothing.

## Expected behaviour

A package named in `transform` has its dependencies walked as a detected package's are: museum-screen-helper is compiled and reads `Platform.OS`.
