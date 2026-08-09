---
"vitest-native": minor
---

Add a `netInfo` preset for `@react-native-community/netinfo`

NetInfo was detected and compiled correctly, and still failed at the native-module
boundary. The generic stub answers any method with `undefined`; NetInfo awaits
`getCurrentState()` and reads `state.isInternetReachable` off the result, so a test
that called `NetInfo.fetch()` died on a TypeError and an unhandled rejection.

No generic stub can infer that shape, which is what earns a preset. It is auto-detected
like the others, and covers the package's real runtime surface: `configure`, `fetch`,
`refresh`, `addEventListener`, `useNetInfo`, `useNetInfoInstance`, and the
`NetInfoStateType` / `NetInfoCellularGeneration` enums — which are TypeScript enums
re-exported through `export *`, so unlike the rest of that module they do have runtime
bindings.

The resting state is a connected wifi device. The real library starts at
`{ type: 'unknown', isConnected: null }` and resolves to the device a moment later; a
mock has no device, and a null resting state would send every component under test down
its offline branch. Tests can drive it, and `resetAllMocks()` restores it.

The package is now a devDependency, so the preset's declared exports are checked against
the real package's TypeScript surface by the existing fidelity gate rather than trusted.
