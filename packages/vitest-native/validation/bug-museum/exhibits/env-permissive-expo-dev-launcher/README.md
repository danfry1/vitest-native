# Importing expo throws under `nativeModules: 'permissive'`

- **Class:** env-contract
- **Source:** the 0.14.0 release candidates (rc.10 and rc.11)
- **Fixed by:** #439 (merged)
- **Needs:** nothing beyond this repository's install (expo 58)

## The bug

`nativeModules: 'permissive'` makes every native module present, with every member a function. That included `EXDevLauncher`, which only expo-dev-launcher registers, in a development build. expo-constants parses `NativeModules.EXDevLauncher.manifestString` whenever the module is present, so it ran `JSON.parse` on a stub function and importing `expo` or `expo-constants` threw `Unexpected token '(', "(...args) "... is not valid JSON`.

## Expected behaviour

The default runtime models Expo Go, as jest-expo does, and Expo Go has no dev launcher: `NativeModules.EXDevLauncher` is undefined in every mode, so `expo` imports.
