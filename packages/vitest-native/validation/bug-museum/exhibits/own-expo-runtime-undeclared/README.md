# Expo's runtime loads uncompiled where expo resolves but is not compiled

- **Class:** ownership
- **Source:** the repository's own bug museum, once its install had `expo` 58 for another package's tests: 46 exhibits that do not declare expo failed with "Cannot find module '…/expo/build/winter/runtime'"
- **Fixed by:** open (`fix/expo-runtime-follows-ownership`)
- **Needs:** nothing beyond this repository's install (`vendor/` holds expo 58's layout)

## The bug

The native setup file installs Expo's winter runtime, as jest-expo's setup does, whenever `expo` resolves from the project. Node compiles `expo` only when the engine owns it for the project (declared, detected, or named in `transform`). SDK 58 publishes `build/winter/*.js` as ES module syntax in a package without `"type": "module"`, so where `expo` resolves without being compiled (a hoisted workspace with an Expo app beside the package, a library whose expo-* devDependencies pull `expo` in as a peer), the runtime loaded raw and every test file failed in the setup file.

## Expected behaviour

The runtime is installed only when Node compiles `expo` for the project. Here it does not, so the test file runs.
