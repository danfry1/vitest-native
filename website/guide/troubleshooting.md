# Troubleshooting

## "vitest-native helpers called before setup"

This means the plugin isn't configured. Ensure `reactNative()` is in your `vitest.config.ts` `plugins` array.

## RNTL queries not finding components

Host component names are handled for you — the plugin sets them for older RNTL, and RNTL ≥ 12 auto-detects them against real RN host names. If you're having issues:

1. Make sure `@testing-library/react-native` is installed.
2. **Don't** manually configure `hostComponentNames` — leave it to the plugin / RNTL's auto-detection. Removing a manual config often fixes this.

## Asset imports returning undefined

The plugin stubs common asset extensions (png, jpg, gif, mp4, mp3, ttf, etc.). For custom formats, use [`assetExts`](/guide/plugin-options#assetexts):

```ts
reactNative({
  assetExts: ['.lottie', '.m4b'],
})
```

## "Invalid hook call" warnings in test output

If you call `useColorScheme` or `useWindowDimensions` directly outside a component (e.g. in API tests), you'll see a React warning in stderr. The mock handles this gracefully with a try/catch fallback — **the test still passes**, and the warning is expected.

## `vi.mock` of an RN-side library isn't taking effect

Under `engine: 'native'`, libraries that load through Node (not your Vite source graph) bypass Vitest's mocker. Prefer a [preset](/guide/presets) if one exists, or mock at the native boundary. Your *own* modules mock normally. See [How It Works](/guide/how-it-works#a-consequence-worth-knowing).

## A third-party library ships untranspiled source and fails to parse

Add it to the [`transform` allowlist](/guide/plugin-options#transform) (the native-engine equivalent of Jest's `transformIgnorePatterns`):

```ts
reactNative({ transform: ['some-untranspiled-lib'] })
```

## `NativeModules.SomeModule` is undefined

Under `engine: 'native'`, a native module that no app binary registers is absent, as on a device and under Jest's React Native preset: `NativeModules.SomeModule` is `undefined` and `TurboModuleRegistry.get('SomeModule')` is `null`. React Native's own modules, and any module requested through `TurboModuleRegistry.getEnforcing`, are always present (see [which native modules exist](/guide/how-it-works#which-native-modules-exist)). If the code under test needs a third-party module, register it in a setup file or test:

```ts
import { mockNativeModule } from 'vitest-native/helpers'

mockNativeModule('SomeModule', { getValue: () => Promise.resolve(42) })
```

The same applies to a method a React Native module's codegen spec does not declare: it is `undefined`, as on a device. To run a suite written against the earlier behaviour while you add registrations, set [`nativeModules: 'permissive'`](/guide/plugin-options#nativemodules).

## Snapshots mismatch after switching from Jest

Under `engine: 'native'`, real React Native renders **real host component names** (`RCTText`, `RCTView`, `RCTScrollView`), whereas `@react-native/jest-preset` snapshots show mock names (`Text`, `View`). Run once with `vitest run -u` to re-record. Prefer explicit queries over large snapshots — they're robust across host names. See [Migrating from Jest](/migration/from-jest#re-record-snapshots).

## A test passes on its own but fails when run with other files

The engine banner says `hot runtime` when the native engine is reusing workers across files (the default wherever the run can be bounded). The hot runtime resets app/test modules, mocks, timers and a verified list of process-wide state between files, but a library that keeps state somewhere else can carry it into the next file. To confirm, run with per-file isolation:

```ts
reactNative({ hotRuntime: false })
```

If the failure goes away, keep `hotRuntime: false` for that project and please [open an issue](https://github.com/danfry1/vitest-native/issues) with the library involved — the hot runtime's isolation is meant to match per-file isolation, and a case where it does not is a bug. Setting `test.isolate` explicitly in your Vitest config also keeps Vitest's own isolation.

## Still stuck?

If something that worked under Jest or the old `vitest-react-native` plugin doesn't work here, [open an issue](https://github.com/danfry1/vitest-native/issues) — parity is a goal, and the cross-check corpus is how we prove it.
