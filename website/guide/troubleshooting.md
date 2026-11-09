# Troubleshooting

An error that starts with `[vitest-native]` has a code; the [error-code reference](/guide/errors) lists each one with its common causes.

## "helpers were called before setup ran"

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

Under `engine: 'native'`, React Native and third-party React Native packages load through Node. `vi.mock` applies to what your test and app source import, but not to `require()` calls inside a Node-loaded library: a library's own import of a mocked package still gets the real one. Prefer a [preset](/guide/presets) if one exists, mock at the native boundary with [`mockNativeModule`](/guide/helpers#mocknativemodule-name-impl), or test that boundary on the mock engine. See [what `vi.mock` reaches](/guide/mocking#what-vi-mock-reaches).

## A third-party library ships untranspiled source and fails to parse

Packages that declare `react-native` are compiled automatically. For one that doesn't, add it to [`transform`](/guide/plugin-options#transform) (the native-engine equivalent of Jest's `transformIgnorePatterns`); if compiling a package is what fails, exclude it with `transform: { exclude: [...] }`. See [untranspiled packages](/guide/mocking#packages-that-ship-untranspiled-source).

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

## `findBy*` or `waitFor` times out under `vi.useFakeTimers()`

Under the mock engine, RNTL advances fake timers only with the [jest-compat layer](/guide/jest-compat). Add it, or advance the clock before querying: `await vi.advanceTimersByTimeAsync(ms)`. Under the native engine this works with no setup; if it still times out there, see [Mocking: fake timers](/guide/mocking#fake-timers) and, under the hot runtime, the next entry.

## A test passes on its own but fails when run with other files

If the engine banner says `hot runtime`, the native engine is reusing workers across files: the default (`hotRuntime: 'auto'`) does where the run can be bounded, and `true` requires it. `hotRuntime: false` gives every file a fresh worker. The hot runtime resets app/test modules, mocks, timers and a verified list of process-wide state between files, but some state is known to carry over. To confirm, run with per-file isolation:

```ts
reactNative({ hotRuntime: false });
```

Known differences from per-file isolation under the hot runtime:

- **`useId` values continue from the previous file**, so a snapshot that contains a generated id can change with file order.
- **React shows a development warning once per worker, not once per file.** A setup that fails a test on `console.error` can miss a warning in a later file.
- **An `act()` scope left open stays open for the worker.** A test that times out while awaiting `act()`, or starts an async `act()` without awaiting it, leaves React's scope open, and later renders on that worker would never commit. With two or more workers the hot runtime replaces that worker after the file, and the timed-out test names the open scope. With one worker it cannot: the next file waits up to `testTimeout` for the scope to close, and if it does not, the remaining files fail with `this worker cannot run this file`, naming the file that left it open.
- **Fake timers active when React first loads stay captured by React's scheduler**, so a later file's timer-driven updates never render, and that file fails at its test timeout. This happens when a setup file imports React and then enables fake timers, or when a test file enables fake timers before React is first loaded.
- **RNTL reinstalls fake timers only in the first file that loads it.** When RNTL loads while fake timers are on, it switches to real timers and back to capture the real ones. That reinstalls Vitest's fake timers with the project's `fakeTimers` config, and drops per-call options, the system time and pending fake timers. Under per-file isolation this happens in every file, as under Jest. Under the hot runtime RNTL stays loaded, so it happens only in the first file, and a setup file's `vi.setSystemTime()` or per-call options survive in later files.
- **An environment variable a module sets when it is imported is set only in the first file on a worker that imports it.** The hot runtime restores `process.env` between files, but the module stays loaded and does not run again in later files. RNTL's `@testing-library/react-native/dont-cleanup-after-each` is handled: from 0.15.0 it takes effect in every file that imports it, directly or through a shared helper. For another module, set the variable in each file that needs it, with `vi.stubEnv('NAME', 'value')` at the top of the file.

If the failure goes away with `hotRuntime: false`, keep that setting for the project. If it is not one of the cases above, please [open an issue](https://github.com/danfry1/vitest-native/issues) with the library involved. Setting `test.isolate` explicitly in your Vitest config also keeps Vitest's own isolation.

## "Cannot find module" keeps failing after the missing file exists

The plugin turns on Vitest's persistent transform cache, `fsModuleCache` (see [how it works](/guide/how-it-works#_4-transform-cache)). Vitest 5.0.5 can keep a test file's transform from a run where one of its imports did not resolve, and reuse it after the import target exists. The error names a root-relative path, such as `'/lib/components'` for `import '../../lib/components'`, and it persists across runs.

It happens when all of these hold:

- the import is relative and points outside the Vitest project's root, for example to another workspace package's build output;
- the import is dynamic: an `import()` in the file, or a static import that Vitest turns into one because the file calls `vi.mock` (any `vi.mock`, not only one of that module);
- the importing file is in a subdirectory of the root, such as `src/`;
- one run happened while the target was missing, for example before the other package was built.

This is a Vitest bug, tracked in [vitest-dev/vitest#11789](https://github.com/vitest-dev/vitest/issues/11789). It is reproduced on Vitest 5.0.5. To recover, clear Vitest's cache with `vitest --clearCache`, or delete `node_modules/.vitest-cache` at the workspace root (or the directory set in `test.fsModuleCachePath`). To avoid it, build the other package before the first test run, or set `test.fsModuleCache: false` for that project.

## `CONTEXT_INVALID` at startup

The plugin writes one description of each Vitest project, its _project context_, to `node_modules/.cache/vitest-native/contexts/` (or the system temp directory when that cannot be written), and every worker reads its configuration from that file. `CONTEXT_INVALID` means a worker found it missing, from another version, changed after it was written, or with a field of the wrong shape; the message names the reason, the field and the directory. Re-run Vitest, and if it persists delete that directory. A worker started without the plugin's configuration reports it too.

## Getting more detail in the log

Turn on the plugin's diagnostics in the config:

```ts
reactNative({ diagnostics: true });
```

It logs how modules resolve, which engine and presets apply, and the hot runtime's full memory plan. It is a plugin option only; to turn it on for one run, see [`diagnostics`](/guide/plugin-options#diagnostics). Without it, the startup log still names the engine, the presets and, under the hot runtime, the worker count (`[vitest-native] workers: …`), or why the hot runtime is off.

## When React Native's precompiled modules are reused or rebuilt

The native engine compiles React Native once into a single precompiled file (see [engines](/guide/engines)) and reuses it on later runs, one file per platform and configuration. It is stored in `node_modules/.cache/vitest-native/registry/` under the Vitest project's root. A project without a `node_modules` of its own, such as a workspace package whose dependencies are hoisted, uses the nearest one above it that holds React Native. When neither exists or can be written, it is `vitest-native-cache/registry/` in the system temp directory.

A run reuses it when all of these are unchanged, and rebuilds it otherwise:

- the vitest-native version;
- which `react-native` the project resolves, and the versions of `react-native`, `react`, `expo`, `@babel/core` and the Babel preset React Native compiles with;
- the `platform` option, the source and asset extensions (the defaults, or your Metro config's with `metroConfig: true`, plus the `assetExts` option), and `BABEL_ENV` / `NODE_ENV`;
- the files it was built from, React Native's own and those they load from other packages such as `react`: each is checked by size and modification time, so editing or reinstalling either rebuilds it.

To force a rebuild, delete that `registry` directory; files for earlier configurations stay there until you do. To run without the precompiled file (each module is then loaded on its own, more slowly, with the same results), set `VITEST_NATIVE_NO_REGISTRY=1`.

## `@react-native/babel-preset not found — using the mock engine`

You asked for the default (`auto`) engine but the native engine's Babel packages aren't installed, so it fell back to the mock engine. An Expo project needs nothing extra: the engine uses Expo's preset, and `expo` brings `@babel/core`. Otherwise, to run real React Native, install them:

```bash
npm i -D @react-native/babel-preset @babel/core
```

To silence the notice and stay on mock deliberately, set `reactNative({ engine: 'mock' })`.

## My `babel.config.js` plugin isn't running

Files your tests `import` compile with Vite's Oxc transform, which the plugin configures for the automatic JSX runtime; your own `.js` files compile with JSX enabled, as Metro compiles them. A file that needs a plugin or option in your Babel config that Oxc does not cover (a decorator, a macro import, a custom plugin) or that has an `@flow` pragma compiles with your Babel config instead ([`projectBabel`](/guide/plugin-options#projectbabel)); startup names the plugins that caused it, and `diagnostics: true` names each file. If a plugin you depend on is not named, it is on the covered list: set `projectBabel: 'always'` to compile every project file with Babel. Project TypeScript files that Node loads (through `require()` or `jest.requireActual`) are compiled with your Babel config, as babel-jest compiles them; plain `.js` project files Node loads are not compiled.

**Class fields on React Native 0.86 and earlier.** Under Jest, React Native's preset from those versions compiles class fields as assignments in the constructor (Babel's `loose` class properties). Oxc keeps them as standard class fields. The two differ only when a field has the same name as an accessor on a base class. Under Jest, `class Child extends Base { value = 1 }` calls `Base`'s `value` setter. Under vitest-native it becomes an own property, and against a getter-only base accessor it no longer throws. If a test depends on the Jest behaviour, add `['@babel/plugin-transform-class-properties', { loose: true }]` to your Babel config: [`projectBabel`](/guide/plugin-options#projectbabel) then compiles files with a class through Babel. React Native 0.88's preset keeps standard class fields, so it is not affected ([#624](https://github.com/danfry1/vitest-native/issues/624)).

## `Worker terminated due to reaching memory limit` / `JS heap out of memory`

Every test file that renders real React Native loads a full renderer. Under the hot runtime (the default, `hotRuntime: 'auto'`), workers are reused and recycled on a memory budget; with `hotRuntime: false` each file starts in a fresh worker, so heap does not accumulate across files. Under the hot runtime, set your own heap threshold with `hotRuntime: { mode: 'auto', memoryLimit }` (bytes; see [worker recycling](/guide/hot-runtime#workers-and-memory)).

## `Vitest caught N unhandled errors` in error-boundary tests

A test that intentionally throws inside a component (to exercise an error boundary) makes React log a "recovered from an error during concurrent rendering" message and Vitest count it, even though the boundary worked and the test passes. It's cosmetic and the assertions are unaffected. Silence it in a setup file if you like (for example, filter the message in an `onConsoleLog` or `console.error` wrapper).

## Overriding a preset's mock (e.g. navigation route params)

Auto-detected presets shadow a library with a built-in mock. To change what that mock returns for a test or project, `vi.mock` the module in a setup file and spread the preset's mock. Presets expose the module to Vitest's graph, so `vi.mock` applies and `importOriginal()` returns the preset mock:

```ts
// vitest.setup.ts
vi.mock('@react-navigation/native', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ key: 'r', name: 'Screen', params: { id: '1' } }),
}))
```

For one-off overrides, [`extendPresetMock`](/guide/helpers#extendpresetmock-pkg-overrides) is lighter.

## Node 24.13.0: segmentation fault at startup

On Node 24.13.0, a run can stop at startup with `Segmentation fault` (exit code 139) after Vitest prints `RUN` and before any test reports. It is an intermittent crash inside V8's garbage collector on a worker thread; no vitest-native code appears in the crashing native frames. In our measurements it happened in 2 of 135 cold runs with the hot runtime on Node 24.13.0, and in none of our runs on 24.12, 24.14, 24.16 or 24.18 (50 to 100 runs each, too few to prove any single one of them free of it). Use another Node 24 release, such as 24.14 or later. `vitest-native doctor` warns when it runs on 24.13.0.

## Still stuck?

If something that worked under Jest or the old `vitest-react-native` plugin doesn't work here, [open an issue](https://github.com/danfry1/vitest-native/issues) — parity is a goal, and the cross-check corpus is how we prove it.
