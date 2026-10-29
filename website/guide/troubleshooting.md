# Troubleshooting

## "vitest-native helpers called before setup"

This means the plugin isn't configured. Ensure `reactNative()` is in your `vitest.config.ts` `plugins` array.

## RNTL queries not finding components

Host component names are handled for you — the plugin sets them for older RNTL, and RNTL ≥ 12 auto-detects them against real RN host names. If you're having issues:

1. Make sure `@testing-library/react-native` is installed.
2. **Don't** manually configure `hostComponentNames` — leave it to the plugin / RNTL's auto-detection. Removing a manual config often fixes this.

## Asset imports returning undefined

The plugin loads common asset extensions (png, jpg, gif, mp4, mp3, ttf, etc.) as Metro does, as a registered asset id. For custom formats, use [`assetExts`](/guide/plugin-options#assetexts):

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

If the engine banner says `hot runtime`, the native engine is reusing workers across files because `hotRuntime` is set to `'auto'` or `true`. The default, `hotRuntime: false`, gives every file a fresh worker. The hot runtime resets app/test modules, mocks, timers and a verified list of process-wide state between files, but some state is known to carry over. To confirm, run with per-file isolation:

```ts
reactNative({ hotRuntime: false })
```

Known differences from per-file isolation under the hot runtime:

- **`useId` values continue from the previous file**, so a snapshot that contains a generated id can change with file order.
- **React shows a development warning once per worker, not once per file.** A setup that fails a test on `console.error` can miss a warning in a later file.
- **An un-awaited `act()` can leave the next file's render empty**, so the next file fails instead of the one that forgot `await`.
- **Fake timers active when React first loads stay captured by React's scheduler**, so a later file's timer-driven updates never render, and that file fails at its test timeout. This happens when a setup file imports React and then enables fake timers, or when a test file enables fake timers before React is first loaded.

If the failure goes away with `hotRuntime: false`, keep that setting for the project. If it is not one of the cases above, please [open an issue](https://github.com/danfry1/vitest-native/issues) with the library involved. Setting `test.isolate` explicitly in your Vitest config also keeps Vitest's own isolation.

## `CONTEXT_INVALID` or `RESOLVER_INPUT_MISMATCH` at startup

The plugin writes one description of each Vitest project, its *project context*, to `node_modules/.cache/vitest-native/contexts/` (or the system temp directory when `node_modules` is read-only), and every worker reads its configuration from that file.

- **`CONTEXT_INVALID`** means a worker found the file missing, from another version, changed after it was written, or with a field of the wrong shape. The message names the reason and the field. Re-run Vitest; if it persists, delete the `contexts` directory. A worker started outside the plugin's configuration also reports it.
- **`RESOLVER_INPUT_MISMATCH`** means one part of the run would resolve packages differently from the rest, for example a `--conditions` flag given to only some workers, so a package could load as two copies. The message names the setting and both values. Pass Node options for the whole run, through `test.execArgv` or `NODE_OPTIONS`.

## Still stuck?

If something that worked under Jest or the old `vitest-react-native` plugin doesn't work here, [open an issue](https://github.com/danfry1/vitest-native/issues) — parity is a goal, and the cross-check corpus is how we prove it.
