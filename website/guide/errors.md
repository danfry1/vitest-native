# Error Codes

Errors vitest-native raises start with `[vitest-native]`, and most carry a `code`. The message says what went wrong and how to fix it; this page adds the common causes. Search for the start of the message, or, in your own `try`/`catch`, read `error.code`. (Vitest's reporter shows the message but not the code.)

## Configuration

### `INVALID_OPTION` {#INVALID_OPTION}

An option has the wrong type or value: for example a preset factory passed without calling it (`presets.reanimated` instead of `presets.reanimated()`), a hand-built or copied preset object, a function inside [`mocks`](/guide/plugin-options#mocks), or a `hotRuntime.mode` other than `'auto'` (or `mode: 'auto'` combined with `allowUnboundedMemory: true`). A preset module listed by path raises it too when it does not exist, does not resolve, fails to import, default-exports an async function or something that is not a preset, or reuses a built-in or duplicate preset name. Unknown keys in `transform` raise it as well. The message names the option and the accepted values. See [Plugin Options](/guide/plugin-options).

### `UNKNOWN_OPTION` {#UNKNOWN_OPTION}

A `hotRuntime` or `metroConfig` options object has a key vitest-native does not know. The message lists the valid keys, and for `hotRuntime` suggests the closest one.

### `UNSUPPORTED_NODE` {#UNSUPPORTED_NODE}

The Node running Vitest is one vitest-native does not support: older than 22.22.3 on Node 22 or 24.12.0 on Node 24, or an end-of-life line such as 20, 23 or 25. Earlier releases of 22 and 24 lack the module hooks the native engine loads React Native through, so an update within your Node major is enough; otherwise use Node 26 or later. It also fires when a runtime reports a supported Node version but has no `module.registerHooks` (Bun, for example): run Vitest with Node. See the [requirements](/guide/install#requirements).

### `MOCKS_REQUIRE_MOCK_ENGINE` {#MOCKS_REQUIRE_MOCK_ENGINE}

`mocks` was set while the native engine runs. It applies only to the mock engine, because the native engine runs the real `react-native` module. Use `vi.mock('react-native', …)` in a setup file or [`mockNativeModule`](/guide/helpers#mocknativemodule-name-impl) instead, or set `engine: 'mock'`. See [Mocking](/guide/mocking).

### `ENGINE_REQUIRES_BABEL` {#ENGINE_REQUIRES_BABEL}

`engine: 'native'` was requested, but `react-native`, a React Native Babel preset (`@react-native/babel-preset`, or Expo's own from SDK 56) or `@babel/core` does not resolve from the project. React Native and Expo apps ship all three; install what the message lists as missing, or use `engine: 'auto'` to fall back to the mock engine. See [Installation](/guide/install).

### `UNSUPPORTED_PEER` {#UNSUPPORTED_PEER}

An installed peer is outside the supported range (Vitest, Vite, React or React Native Testing Library), or a package a feature needs is missing, such as `@vitest/coverage-v8` for v8 coverage (install it at the same version as `vitest`) or React Native's asset registry. The message lists each problem. See the [requirements](/guide/install#requirements); `vitest-native doctor` checks them.

### `UNSUPPORTED_POOL` {#UNSUPPORTED_POOL}

The native engine, or the Skia preset, was asked to run on a VM pool (`vmThreads` or `vmForks`). React Native loads through Node's module hooks, which a VM pool's context does not use. Use `threads` (the default) or `forks`, or `engine: 'mock'`, which needs no hooks; for Skia alone, `presets: { skia: false }` also works.

### `INLINE_BREAKS_OWNERSHIP` {#INLINE_BREAKS_OWNERSHIP}

A Vitest `server.deps.inline` setting (`true`, or a list naming React Native packages) pulls React Native packages into Vite while the native engine loads them through Node, so one package could load twice with separate state. Remove the overlapping inline rule; to compile an untranspiled package, use [`transform`](/guide/mocking#packages-that-ship-untranspiled-source) instead.

### `MODULE_OWNER_CONFLICT` {#MODULE_OWNER_CONFLICT}

Vite was asked to transform a file the native engine loads through Node, which would create a second copy of that module. The message names the file and the reason. Remove the inline or `noExternal` rule that claimed it; React Native source packages belong in [`transform`](/guide/plugin-options#transform).

### `SHARED_VITE_SERVER` {#SHARED_VITE_SERVER}

A Vitest project shares a Vite server with one that has vitest-native's config, so React Native's setup would not run for it. Give the project its own `root`, or set `test.sharedViteServer: false` in the top-level config.

### `VITEST_TWIN_INSTANCE` {#VITEST_TWIN_INSTANCE}

Two copies of Vitest are installed, and part of the run loads the one that is not running the tests, so every test file would fail. The message shows both paths. Install one Vitest version that both resolve (dedupe it in the workspace).

### `METRO_CONFIG_LOAD_FAILED` {#METRO_CONFIG_LOAD_FAILED}

With [`metroConfig`](/guide/plugin-options#metroconfig) on, the project's Metro config could not be loaded. Fix the Metro config, point at it with `metroConfig: { configFile: '…' }` when it is outside the project root, or set `metroConfig: false`.

### `METRO_PROFILE_INVALID` {#METRO_PROFILE_INVALID}

With `metroConfig` on, the loaded Metro config has no usable `resolver.sourceExts` or `resolver.assetExts` arrays (for example an empty or non-string extension). Check those fields in the Metro config.

### `CONTEXT_INVALID` {#CONTEXT_INVALID}

A test worker could not read the configuration the plugin writes for it: missing, from another vitest-native version, changed after it was written, or malformed. It also fires when one Vitest project is handed another project's settings: give each Vitest project its own `root`. Otherwise re-run Vitest, and if it persists, delete the directory the message names. See [troubleshooting](/guide/troubleshooting#context-invalid-at-startup).

## Loading your code

### `TRANSFORM_FAILED` {#TRANSFORM_FAILED}

Babel's worker could not compile a file at all: it failed to start, stopped answering (a very large file or out of memory; raise Node's `--max-old-space-size`), or ended early (for example a `process.exit()` in a Babel config, preset or plugin). It also fires for an asset with no name before its extension (`.png`), which Metro cannot register either, and for an asset loaded before the plugin finished configuring. A syntax error Babel reports in a file is a different error, with no code.

### `BABEL_IGNORES_FILE` {#BABEL_IGNORES_FILE}

A project file Node loads (through `require()` or `jest.requireActual`) is excluded by the project's Babel config `ignore` or `only`, so it cannot be compiled. babel-jest fails the same way. Remove it from `ignore`, or add it to `only`.

### `IMPORT_META_IN_NODE_OWNED` {#IMPORT_META_IN_NODE_OWNED}

A file Node loads compiled to CommonJS uses `import.meta` beyond `url`, `filename` and `dirname`, which CommonJS cannot provide. The message names the file and the property. Move that code into a file your tests import, or avoid the property in it.

### `PRESET_UNAVAILABLE` {#PRESET_UNAVAILABLE}

A preset cannot be applied:

- it is listed in `presets`, but none of its packages resolve from the project root: set the Vitest project's `root` to the package that depends on them, or remove the preset;
- a preset module changed after the run started: restart the run;
- the installed package's exports could not be read;
- the Skia preset is on but Skia is not installed, or CanvasKit failed to load: install it, or set `presets: { skia: false }`;
- the reanimated preset needs a `react-native` component that is missing, usually because a `vi.mock('react-native')` replaces the whole module: spread `importOriginal()` into the mock instead.

The message says which.

### `PRESET_NOT_PREPARED` {#PRESET_NOT_PREPARED}

The Skia preset's mock was built before CanvasKit loaded. Inside a test run the setup file loads it first; a mock built outside a test run needs `await presets.skia().prepare()` first.

### `NITRO_HYBRID_OBJECT_UNAVAILABLE` {#NITRO_HYBRID_OBJECT_UNAVAILABLE}

A library asked Nitro for a native HybridObject, which has no implementation in tests. Use the library's own test mode if it has one, or mock the library with `vi.mock()`.

### `UNKNOWN_DISPATCH_STEP` {#UNKNOWN_DISPATCH_STEP}

vitest-native's module loader was given a step it does not know. Usually two copies of vitest-native, of different versions, are loaded into the same process; no configuration causes it otherwise. Install one vitest-native version (dedupe it in the workspace), and report it with your config if it persists.

### `LIBRARY_REGISTRY_FAILED` {#LIBRARY_REGISTRY_FAILED}

vitest-native could not precompile the modules of libraries such as Reanimated and Worklets into one file, which makes them load faster. You see it as a warning, `could not precompile the library registry (…); those libraries load file by file, which is slower`, and results are unaffected; the code itself is raised only inside the process that builds the file. The build is retried once any file it read changes. To retry sooner, delete the `registry` folder in vitest-native's cache ([where it lives](/guide/troubleshooting#when-react-native-s-precompiled-modules-are-reused-or-rebuilt)). If the warning keeps coming back, report the reason it names.

## Helpers and jest-compat

### `HELPERS_BEFORE_SETUP` {#HELPERS_BEFORE_SETUP}

A helper from `vitest-native/helpers` ran before the plugin's setup, usually because `reactNative()` is not in the Vitest config's `plugins`, or the helper runs outside a test run.

### `WRONG_ENGINE_FOR_HELPER` {#WRONG_ENGINE_FOR_HELPER}

`setPlatform()` was called under the native engine, which picks platform files when the module graph loads. Set `reactNative({ platform: 'android' })`, or run each platform as its own Vitest project. See [helpers](/guide/helpers#setplatform-os).

### `JEST_API_UNSUPPORTED` {#JEST_API_UNSUPPORTED}

A `jest.*` API with no Vitest equivalent was called (such as `jest.createMockFromModule`), or a `jest.mock` factory was used that this test file never registered. For an unsupported API, the message names the replacement. See [jest-compat](/guide/jest-compat).

### `JEST_COMPAT_SETUP_MISSING` {#JEST_COMPAT_SETUP_MISSING}

A test file uses `jest.mock()` factories, but the jest-compat setup is not loaded. Add `jestCompatSetup` from `vitest-native/jest-compat` to `test.setupFiles`, ahead of any setup file that calls `jest.mock()`. See [jest-compat](/guide/jest-compat).

### `JEST_MOCK_FACTORY_CYCLE` {#JEST_MOCK_FACTORY_CYCLE}

A `jest.mock` factory requires the module it mocks, directly or through something it loads. Use `jest.requireActual()` inside the factory for the real module, or break the cycle. It also fires when something requires the mocked module while its factory is still loading the real module, which `require()` cannot wait for: break the cycle, or import the module instead of requiring it.

### `REQUIRE_ACTUAL_ALIAS_UNSUPPORTED` {#REQUIRE_ACTUAL_ALIAS_UNSUPPORTED}

`jest.requireActual()` could not resolve a path that depends on a `resolve.alias` entry it cannot apply: only string-to-string aliases work there. Use a string `find` for that alias, or a relative path.

### `MOCK_NOT_SEEN_BY_NODE` {#MOCK_NOT_SEEN_BY_NODE}

With [`experimental.nodeMocks`](/guide/plugin-options#experimental) on (or `ownershipModel: 'resolution'`, which turns it on), a `vi.mock` applies to modules Node loads too, as `jest.mock` does under Jest. This error means a module Node loads required the mocked module before the mock could be handed to it, so it fails by name instead of quietly loading the real module. The message names the requiring file and the reason, which is one of:

- an async factory that has not settled;
- an automock or `__mocks__` file the test has not imported yet;
- a `vi.doMock` or `vi.doUnmock`, which Vitest applies only on the test's next import;
- a package that Vite and Node resolve to different files.

Import the mocked module in the test before the code that requires it, or give the mock a synchronous factory. The message is also printed once as a warning, because a package that probes for an optional dependency with `try { require(x) } catch {}` would otherwise swallow it.

## Hot runtime

These come from the opt-in [hot runtime](/guide/hot-runtime). Setting `hotRuntime: false` avoids all of them.

### `HOT_RUNTIME_OVERRIDDEN` {#HOT_RUNTIME_OVERRIDDEN}

`hotRuntime: true` (or an options object without `mode: 'auto'`) was set, but something in the config or on the command line rules it out: an explicit pool, `test.isolate`, `--no-isolate`, `--maxWorkers=1` and the like. Remove that setting, or use `hotRuntime: 'auto'` (or add `mode: 'auto'`) to fall back to per-file isolation instead of failing.

### `HOT_RUNTIME_UNAVAILABLE` {#HOT_RUNTIME_UNAVAILABLE}

The hot runtime's worker would load a different Vitest from the one running the tests, which would report no results rather than fail. It happens when vitest-native and Vitest resolve from different `node_modules` trees (linked packages, hoisted monorepo installs, mixed Vitest versions). Install one Vitest version reachable from vitest-native, or set `hotRuntime: false`.

### `HOT_MEMORY_UNBOUNDED` {#HOT_MEMORY_UNBOUNDED}

The hot runtime cannot enforce its memory budget with one worker, because Vitest then runs every file as one task. Use `maxWorkers` of 2 or more, set `hotRuntime: false`, or accept the risk with `hotRuntime: { allowUnboundedMemory: true }`. See [workers and memory](/guide/hot-runtime#workers-and-memory).

### `HOT_MEMORY_BUDGET_EXCEEDED` {#HOT_MEMORY_BUDGET_EXCEEDED}

The test process reached the hard memory limit the hot runtime derived from the host or container, so it stopped before the system could kill it. Reduce `maxWorkers`, give the run more memory, or set `hotRuntime: false`. `hotRuntime: { allowUnboundedMemory: true }` turns the limit off; use it only when something outside the run already bounds its memory.

### `HOT_RESIDENT_UNUSABLE` {#HOT_RESIDENT_UNUSABLE}

An earlier file on a reused worker left state open, usually an `act()` scope that never closed, and it did not close in time, so this file could not render. The message names the file that left it. See [a test passes on its own but fails with other files](/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files).

### `HOT_FILE_NOT_RUN` {#HOT_FILE_NOT_RUN}

A test file scheduled on a hot worker never ran, because an earlier step of the same task failed outside any test file. The message names the files and the cause; fix that cause first.

### `HOT_STATE_CAPTURE_FAILED` {#HOT_STATE_CAPTURE_FAILED}

The hot runtime could not record a piece of process state it restores between files. The message names it and the underlying error. Set `hotRuntime: false` and report it.

### `HOT_STATE_RESTORE_FAILED` {#HOT_STATE_RESTORE_FAILED}

After a file, some process state could not be restored to how it was before the file ran (for example `jest.mock` registrations that remain). The message says what was left. One cause a test can create: a global defined as non-configurable (`could not delete …`); define it with `configurable: true`. Set `hotRuntime: false` for the suite and report it with the file involved.

### `HOT_CJS_CACHE_RESET` {#HOT_CJS_CACHE_RESET}

Node's CommonJS module cache could not be reset safely between files, usually because a custom loader changed it. Set `hotRuntime: false`.

### `HOT_WORKER_ENV` {#HOT_WORKER_ENV}

The hot runtime's worker entry was started outside a `worker_threads` worker. This means another pool or tool started it; it is not a setting to change. Report it with your config.

### `HOT_WORKER_PRELOAD` {#HOT_WORKER_PRELOAD}

A hot worker could not load React Native from the project when it started. The message carries the underlying error, which is usually the same one a run with `hotRuntime: false` shows.

## CLI

### `COMPARE_REPORT_INVALID` {#COMPARE_REPORT_INVALID}

`vitest-native compare` read a JSON file that is not a Jest or Vitest report: it has no `testResults` array. compare prints the message and exits with code 2. The usual cause is a `--jest-results` path that names some other JSON file. Point it at the file Jest wrote with `--json --outputFile`, or leave out `--jest-results` and compare runs Jest itself.

## Ownership model (experimental)

These come only from [`experimental.ownershipModel`](/guide/plugin-options#experimental), which makes Vite and Node resolve each package to the same file. Turning the option off makes them go away. Most of them mean a vitest-native bug: report it with the Vitest config. The design is described in [ownership-model.md](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/docs/ownership-model.md).

### `RESOLVER_INPUTS_MISSING` {#RESOLVER_INPUTS_MISSING}

A test worker runs with the option on, but the project's configuration has no resolver inputs, so Node would resolve as if the option were off while Vite resolves with it. The plugin records them before any worker starts, so this means a worker started without the plugin's setup step. Report it, with the Vitest config.

### `RESOLVER_INPUT_MISMATCH` {#RESOLVER_INPUT_MISMATCH}

Two parts of the run would resolve with different inputs, for example different `--conditions`, and a package could then load twice. The message names the setting and both values. Set `--conditions` in one place (`test.execArgv`, or `NODE_OPTIONS` for the whole run). If the values come from nothing you set, report it.

### `RESOLVER_ERROR` {#RESOLVER_ERROR}

The shared resolver failed while React Native's precompiled modules were being built. The message lists each failure. Report it, with the Vitest config and the packages it names.

### `BRIDGE_UNAVAILABLE` {#BRIDGE_UNAVAILABLE}

With `ownershipModel: 'resolution'`, Node's `require()` of a file Vite loads goes through a bridge to Vitest's main process. The bridge could not start: the main process could not listen, or the worker was not given the bridge's address. Report it, with the Vitest config.

### `BRIDGE_CONTRACT_CHANGED` {#BRIDGE_CONTRACT_CHANGED}

A part of Vitest or Vite the bridge relies on is not where this vitest-native version expects it, usually after a Vitest or Vite upgrade. Set the option back to `'resolver'`, and report it with the Vitest and Vite versions.

### `BRIDGE_FILE_REFUSED` {#BRIDGE_FILE_REFUSED}

A `require()` reached a file the bridge will not fetch: outside the project's directories, or refused by Vite's `server.fs` rules. Installed packages are always allowed. The message names the file. Move it inside the project, or allow its directory in `server.fs.allow`.

### `VITE_FETCH_FAILED` {#VITE_FETCH_FAILED}

Vite could not return its transform of a file a `require()` reached, or the bridge's thread ended before it did. The message carries Vite's own error; the bridge thread's error, if it has one, is printed separately as "the require bridge's thread:". Fix the error Vite reports; if there is none, report it.

### `VITE_FETCH_TIMEOUT` {#VITE_FETCH_TIMEOUT}

The main process did not return Vite's transform of a file a `require()` reached in time, so the `require()` cannot be answered and the bridge's thread was stopped. The usual cause is a transform that hangs, such as a Vite plugin waiting on something that never arrives. The message names the file.

### `REQUIRE_OF_ASYNC_VITE_MODULE` {#REQUIRE_OF_ASYNC_VITE_MODULE}

A `require()` reached a file with top-level `await`. `require()` cannot wait for it, and Node's own `require()` of such an ES module refuses it too. Import the file from the test, or a setup file, before the code that requires it runs.

### `REQUIRE_OF_EVALUATING_VITE_MODULE` {#REQUIRE_OF_EVALUATING_VITE_MODULE}

A `require()` reached a file Vite is part-way through evaluating, from outside that evaluation, while the evaluation waits on something else. Its exports are unfinished, so returning them would be wrong. Await the import that evaluates it before the code that requires it runs.

### `BRIDGED_EVALUATION_FAILED` {#BRIDGED_EVALUATION_FAILED}

A file Vite loads threw while it was being evaluated, so the `require()` of it fails too, as an import of it would. The original error is attached as the `cause`. Fix that error.

Next: [Troubleshooting](/guide/troubleshooting).
