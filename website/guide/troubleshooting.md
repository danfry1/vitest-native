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
  assetExts: [".lottie", ".m4b"],
});
```

## "Invalid hook call" warnings in test output

If you call `useColorScheme` or `useWindowDimensions` directly outside a component (e.g. in API tests), you'll see a React warning in stderr. The mock handles this gracefully with a try/catch fallback — **the test still passes**, and the warning is expected.

## `vi.mock` of an RN-side library isn't taking effect

Under `engine: 'native'`, libraries that load through Node (not your Vite source graph) bypass Vitest's mocker. Prefer a [preset](/guide/presets) if one exists, or mock at the native boundary. Your _own_ modules mock normally. See [How It Works](/guide/how-it-works#a-consequence-worth-knowing).

## A third-party library ships untranspiled source and fails to parse

Add it to the [`transform` allowlist](/guide/plugin-options#transform) (the native-engine equivalent of Jest's `transformIgnorePatterns`):

```ts
reactNative({ transform: ["some-untranspiled-lib"] });
```

## `NativeModules.SomeModule` is undefined

Under `engine: 'native'`, a native module that no app binary registers is absent, as on a device and under Jest's React Native preset: `NativeModules.SomeModule` is `undefined` and `TurboModuleRegistry.get('SomeModule')` is `null`. React Native's own modules, and any module requested through `TurboModuleRegistry.getEnforcing`, are always present (see [which native modules exist](/guide/how-it-works#which-native-modules-exist)). If the code under test needs a third-party module, register it in a setup file or test:

```ts
import { mockNativeModule } from "vitest-native/helpers";

mockNativeModule("SomeModule", { getValue: () => Promise.resolve(42) });
```

The same applies to a method a React Native module's codegen spec does not declare: it is `undefined`, as on a device. To run a suite written against the earlier behaviour while you add registrations, set [`nativeModules: 'permissive'`](/guide/plugin-options#nativemodules).

## Snapshots mismatch after switching from Jest

Vitest keys snapshots differently from Jest (`a > b 1` against Jest's `a b 1`; `name > hint 1` against `name: hint 1`), so it treats most of Jest's entries as missing: a local run writes new ones and passes, a CI run fails them as `mismatched`, and both rewrite the file's header to Vitest's, which `jest --ci` then refuses. Under `engine: 'native'`, real React Native also renders **real host component names** (`RCTText`, `RCTView`, `RCTScrollView`) where `@react-native/jest-preset` snapshots show mock names (`Text`, `View`). Running `vitest -u` against Jest's files rewrites them for Vitest and deletes Jest's entries. While both runners run, point Vitest at its own directory with `test.resolveSnapshotPath` and record there — see [Migrating from Jest](/migration/from-jest#snapshots). Prefer explicit queries over large snapshots — they're robust across host names.

## `findBy*` or `waitFor` times out under `vi.useFakeTimers()` with the mock engine

RNTL advances fake timers only through a `jest` it can see. Under `engine: 'native'`, RNTL's own files get one backed by `vi`, so `findBy*`, `waitFor` and `userEvent` delays advance Vitest's fake clock, with or without jest-compat. The mock engine does not give RNTL one yet. Without the [jest-compat layer](/guide/jest-compat), these helpers wait in real time while the fake clock stands still, and time out. Add jest-compat, or advance the clock before querying: `await vi.advanceTimersByTimeAsync(ms)`.

## A test passes on its own but fails when run with other files

If the engine banner says `hot runtime`, the native engine is reusing workers across files because `hotRuntime` is set to `'auto'` or `true`. The default, `hotRuntime: false`, gives every file a fresh worker. The hot runtime resets app/test modules, mocks, timers and a verified list of process-wide state between files, but some state is known to carry over. To confirm, run with per-file isolation:

```ts
reactNative({ hotRuntime: false });
```

Known differences from per-file isolation under the hot runtime:

- **`useId` values continue from the previous file**, so a snapshot that contains a generated id can change with file order.
- **React shows a development warning once per worker, not once per file.** A setup that fails a test on `console.error` can miss a warning in a later file.
- **An un-awaited `act()` can leave the next file's render empty**, so the next file fails instead of the one that forgot `await`.
- **Fake timers active when React first loads stay captured by React's scheduler**, so a later file's timer-driven updates never render, and that file fails at its test timeout. This happens when a setup file imports React and then enables fake timers, or when a test file enables fake timers before React is first loaded.
- **RNTL reinstalls fake timers only in the first file that loads it.** When RNTL loads while fake timers are on, it switches to real timers and back to capture the real ones. That reinstalls Vitest's fake timers with the project's `fakeTimers` config, and drops per-call options, the system time and pending fake timers. Under per-file isolation this happens in every file, as under Jest. Under the hot runtime RNTL stays loaded, so it happens only in the first file, and a setup file's `vi.setSystemTime()` or per-call options survive in later files.

If the failure goes away with `hotRuntime: false`, keep that setting for the project. If it is not one of the cases above, please [open an issue](https://github.com/danfry1/vitest-native/issues) with the library involved. Setting `test.isolate` explicitly in your Vitest config also keeps Vitest's own isolation.

## "Cannot find module" keeps failing after the missing file exists

On Vitest 5 the plugin turns on Vitest's persistent transform cache, `fsModuleCache` (see [how it works](/guide/how-it-works#_4-transform-cache)). Vitest 5.0.5 can keep a test file's transform from a run where one of its imports did not resolve, and reuse it after the import target exists. The error names a root-relative path, such as `'/lib/components'` for `import '../../lib/components'`, and it persists across runs.

It happens when all of these hold:

- the import is relative and points outside the Vitest project's root, for example to another workspace package's build output;
- the import is dynamic: an `import()` in the file, or a static import that Vitest turns into one because the file calls `vi.mock` (any `vi.mock`, not only one of that module);
- the importing file is in a subdirectory of the root, such as `src/`;
- one run happened while the target was missing, for example before the other package was built.

This is a Vitest bug, tracked in [vitest-dev/vitest#11789](https://github.com/vitest-dev/vitest/issues/11789). To recover, clear Vitest's cache with `vitest --clearCache`, or delete `node_modules/.vitest-cache` at the workspace root (or the directory set in `test.fsModuleCachePath`). To avoid it, build the other package before the first test run, or set `test.fsModuleCache: false` for that project.

## `CONTEXT_INVALID` at startup

The plugin writes one description of each Vitest project, its _project context_, to `node_modules/.cache/vitest-native/contexts/` (or the system temp directory when that cannot be written), and every worker reads its configuration from that file. `CONTEXT_INVALID` means a worker found it missing, from another version, changed after it was written, or with a field of the wrong shape; the message names the reason, the field and the directory. Re-run Vitest, and if it persists delete that directory. A worker started without the plugin's configuration reports it too.

## Still stuck?

If something that worked under Jest or the old `vitest-react-native` plugin doesn't work here, [open an issue](https://github.com/danfry1/vitest-native/issues) — parity is a goal, and the cross-check corpus is how we prove it.
