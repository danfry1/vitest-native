# vitest-native

## 0.15.0

### Upgrading from 0.14

- **Node 22.22.3+, 24.12+ or 26+.** An older Node stops at startup with `UNSUPPORTED_NODE`.
- **Vitest 5 and Vite 8.** Vitest 4, or Vite 6 or 7, stops at startup with `UNSUPPORTED_PEER`.
- **React 19, React Native Testing Library 13 or 14, and React Native 0.86+ (Expo SDK 57+) for the
  native engine.** An older React or React Native stops at startup with `UNSUPPORTED_PEER`.
- **Snapshots print in Jest's format.** Run `vitest -u` once to re-record existing snapshots,
  then review the diff.
- **`jestMockTransform()` applies Jest's manual mocks of installed packages** (`__mocks__/<pkg>`),
  as Jest does. Pass `jestMockTransform({ rootMocks: false })` to keep the previous behaviour.
- Run `npx vitest-native doctor` to check all of these. Each entry below has the details.

### Minor Changes

- 48fc91d: **`vitest-native compare --hot` shows whether `hotRuntime: 'auto'` changes any test's result in your suite.** It runs your Vitest config per file and hot, three times each (one warm-up and two timed runs), plus one hot run with shuffled files and one at `--maxWorkers=2`. It matches every test by file, name and occurrence, compares failures by kind, and checks the engine's banner, so a declined `'auto'` gives no verdict. It lists each test whose result differs. With no differences it prints each mode's median and range, and calls hot faster or slower only when each mode has at least two timed runs and their ranges don't overlap. `--runs <n>` changes the run count; 2 or fewer give no speed verdict, and `--json` records each run's role. See [the CLI guide](https://vitest-native.danfry.dev/guide/cli#compare-hot). No action needed.
- 98c62f4: **The hot runtime can run React, its renderers, `scheduler` and RNTL fresh in every file (experimental).** Set `hotRuntime: { freshRuntime: true }` so `useId` values, React's once-per-process warnings, an `act()` scope an earlier file left open, the scheduler's timers and RNTL's fake-timer reinstall no longer carry from one file to the next. It costs about 5 ms per file at four workers, and about 17 ms at one. It needs `esmGeneration`, which is on by default.

- e4473ae: **A test stuck in synchronous code no longer hangs a hot-runtime run forever: the run fails and names the file and test.** Vitest's `testTimeout` can't interrupt a test that never yields, such as a loop that never ends, so such a run used to wait with nothing on screen. The new `hangTimeout` option fails a run when nothing has made progress for 60 s (or twice the longest test or hook timeout) and every running test is past its own timeout, retries included. Every module a file loads through Vite counts as progress, so a slow cold start is not taken for a hang. The report gives each file's running test and when it started, or how long ago a worker took the file, and when the last module loaded. It's on by default under the hot runtime and off otherwise. Add `reactNative({ hangTimeout: <ms> })` to turn it on everywhere, or `hangTimeout: false` to turn it off.
- 1cb74f0: **Behaviour change: `jestMockTransform()` applies Jest's manual mocks of `node_modules` packages.** To keep the previous behaviour, pass `jestMockTransform({ rootMocks: false })`. A file such as `__mocks__/moti.ts` in a `__mocks__` folder under Jest's `roots` now replaces that package with no `jest.mock()` call, as under Jest, for imports and `require()` alike, `__mocks__/react-native.js` included. Before, the real package ran. A setup file's or test file's own `jest.mock()` or `jest.unmock()` still wins.

  - `migrate` lists each such file and carries over Jest's `roots` and `modulePathIgnorePatterns`.
  - A package a preset covers keeps its preset; the run warns that its manual mock is not applied.

- 41959da: **Under jest-compat, `View.prototype` has the native methods, as React Native's Jest preset gives it.** `jest.spyOn(View.prototype, 'measure')` now reaches every `View` ref. It used to fail because React Native's `View` has no prototype. Under the native engine, each native view name now has one host class, so every `View` ref shares the methods a spy replaces.

  No action needed. `Text` and `ScrollView` get no prototype.

- 23275f8: **jest-compat supports `jest.replaceProperty()`.** `jest.replaceProperty(Platform, 'OS', 'android')` replaces the value in place, as Jest does. It used to throw. The returned handle has `replaceValue()` and `restore()`. `jest.restoreAllMocks()`, the `restoreMocks` setting and the end of the test file also restore it; `vi.restoreAllMocks()` does not. It throws Jest's errors for a getter, a function or a missing property.

  No action needed.

- ece53b3: **Files that need a plugin from your project's Babel config now compile with that config, as Metro and babel-jest compile them.** Legacy decorators (WatermelonDB models), macros, `react-native-dotenv`, the worklets plugin, custom plugins and Flow used to fail or behave differently. Remove any `babel()` entry you added only to run them; set [`projectBabel: 'never'`](https://danfry1.github.io/vitest-native/guide/plugin-options#projectbabel) for the previous behaviour.

  - Only a file that uses such a plugin compiles with Babel; other files keep Oxc.
  - `migrate` and `doctor` list these plugins as applied, and `doctor` calls a `babel()` entry that repeats one redundant.
  - It needs `@babel/core` in the project. Without it, `migrate`, `doctor` and the mock engine's startup say so.

- e517388: **Behaviour change: snapshots of React Native trees print in Jest's format.** Run `vitest -u` once to re-record existing vitest-native snapshots, then review the diff. vitest-native no longer registers its own serializer. Jest-written snapshots share the format, but ones inside a `describe`, or of components Jest's preset stubs, still need one re-record ([Snapshots](https://danfry1.github.io/vitest-native/guide/matchers#snapshots)).

  - No host prints `ref`. A host ref, such as a `Text` ref under the native engine or any host ref under the mock engine, is now an instance with `measure`, `focus` and the other native methods, where it used to be the test renderer's node or `null`.
  - `vitest-native/serializer` keeps the old format for one release; it is deprecated.

- a107e3a: **New `vitest-native compare` runs your suite under your own Jest and under Vitest and lists every test whose result differs.** Use it while both runners are in place: `npx vitest-native compare` names each test that passes under Jest but not under Vitest, grouped by its first error, and exits 0 only when every one of them passes and `vitest run` exits 0. Neither run writes snapshots or changes project files, and `--json <file>` writes a report without stack traces or absolute paths, for attaching to an issue. See the [CLI reference](https://danfry1.github.io/vitest-native/guide/cli#compare).
- 4271252: **Under the native engine, `react-native-gesture-handler` and `@shopify/flash-list` run as themselves, with the `jestSetup.js` each ships** before the project's setup files, as a Jest suite lists them. No action needed; to keep a preset, set `presets: { gestureHandler: true }` or `{ flashList: true }`.

  - Gesture Handler 3's hook API, builder methods and test helpers work, and a `Pressable` press fires `onPress`.
  - A `FlashList` renders a window of rows, as under Jest, where the preset rendered every row.
  - `react-native-gesture-handler/Swipeable` and the other modules Gesture Handler 3 does not ship no longer resolve, as under Jest.

- 4271252: **Under the native engine, a React Native library's own Jest setup and mocks get a `jest` with Jest's semantics.** No action needed; a suite that imports `react-native-gesture-handler/jestSetup` or `react-native-safe-area-context/jest/mock` gets what Jest gave it.

  - Their `jest.mock` reaches every `require` of the module, and `jest.requireActual` and `@jest/globals` work.
  - Implementations a library installs while building its mocks survive `vi.resetAllMocks()` and `mockReset: true`.
  - `jest.requireActual` of a package a preset shadows returns the package, as under Jest.

- ebdda39: **Breaking: vitest-native now requires Node 22.22.3+, 24.12+ or 26+, for both engines.** An unsupported Node stops at startup with `UNSUPPORTED_NODE`, naming the release to install; `vitest-native doctor` reports the same.

  Update Node within your major, or move from Node 20, 23 or 25 to a supported line, including CI images and `.nvmrc` or `engines` pins. Remove `VITEST_NATIVE_LOADER_THREAD` from scripts and CI; it no longer has an effect.

  - Under the native engine, a runtime without `module.registerHooks` (Bun) gets `UNSUPPORTED_NODE` too.
  - The support policy is in `docs/versioning.md`.

- dae3119: **Native engine: a file that Vite and Node both load, with both copies in use, is now reported by name, `SOURCE_EVALUATED_TWICE`, instead of silently existing twice.** No action needed. To fail on it, set `reactNative({ ownership: 'error' })`.

  - The report names the file, how each side loaded it, and the fix. Exempt a deliberate case with `ownership: { allow: [{ path, reason }] }`.
  - `require()` of a CommonJS project file a test already imported now returns that same `module.exports`.
  - The warning, its end-of-run summary and `vitest-native doctor` link the [error reference](https://danfry1.github.io/vitest-native/guide/errors#SOURCE_EVALUATED_TWICE).

- 5cad255: **Native engine: a new opt-in flag makes Vite and Node resolve a package to the same file, so one package is one module.** Add `experimental: { ownershipModel: 'resolver' }` to try it. Nothing changes without it.

  - Any package with separate `import` and `require` builds, or a `react-native` field, loads one file on both sides; a JSX or Flow `react-native` field is compiled, as Metro does.
  - RegExp aliases and tsconfig `paths` also apply to Node's `require`, including `jest.requireActual`. `NODE_PATH` applies to `require` only, as in Node.
  - Not covered: an alias with a custom resolver or a function replacement. It is refused at startup by name. See [`experimental`](https://danfry1.github.io/vitest-native/guide/plugin-options#experimental).

- 45154cf: **Native engine: `experimental: { ownershipModel: 'resolution' }` gives Node's `require` of a project file the same instance a test's `import` gets, whichever loads it first.** To try it, set the flag; it also turns on `nodeMocks`, and refuses `nodeMocks: false`.

  - A file not yet evaluated is evaluated then. A `require` back into a module from inside its own evaluation gets its exports so far, as in Node and Jest.
  - Mocks apply to what Node's `require` reaches, as to the test's imports.
  - What cannot be served fails by name: top-level `await`, a module that throws, one still evaluating when required from elsewhere, or a mock not available synchronously (`MOCK_NOT_SEEN_BY_NODE`).

- 4271252: **Under the native engine, the worklets, safe-area-context, keyboard-controller, bottom-sheet and netinfo presets are each library's own Jest mock**, as a Jest suite installs it. No action needed; snapshots of the presets' own output may change, and the mock engine keeps the hand-written presets.

  - Safe-area insets are zero unless `<SafeAreaProvider initialMetrics>` sets them; `setInsets()` still sets them until `resetAllMocks()`.
  - Bottom-sheet's views render only their children, and netinfo reports a connected cellular network.
  - Names a preset served that a mock lacks stay: bottom-sheet's `*_STATUS` enums and footer components, netinfo's `useNetInfoInstance`.

- 4271252: **Reanimated's `interpolate`, `interpolateColor` and `clamp` return real values, and its scroll and event hooks run their handlers.** No action needed; snapshots of interpolated styles may change.

  - Of Reanimated's own mock, only what still answers with a no-op is replaced, so a later Reanimated whose mock does better keeps its own.
  - Shared values take listeners, so a Gesture Handler 3 gesture configured with a shared value works.
  - Reanimated 3.17 to 4.6 get the same fixes in the hand-written preset.

- 4271252: **Under the native engine, Reanimated 4.7+ (with Worklets 0.9+) is Reanimated's own test mock**, as a Jest suite installs it with `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`. No action needed; `presets: { reanimated: false }` turns it off, and older versions keep the hand-written preset.

  - The hand-written preset lacked 104 of the mock's names, among them `interpolateColor`, `Keyframe`, `useScrollOffset` and most layout animations.
  - Worklets is its own test mock too, so a test and Reanimated share one instance; its `runOnJS` and `scheduleOnRN` run a tick later, as under Jest.
  - A setup file that calls Reanimated's `setUpTests()` keeps `toHaveAnimatedStyle` and `toHaveAnimatedProps` working; keep or delete the call.

- 0a71dff: **Native engine: a cold run now starts at once instead of waiting for React Native's precompiled modules to build.** They compile in a low-priority background process.

  To opt out, set `reactNative({ registryBuild: 'wait' })` to build them before the run, as before.

  - Test files that start before the build lands load React Native file by file, which is slower; column numbers in React Native's stack frames can differ.
  - CI runs and `hotRuntime` still wait. On close, a running build gets half of `teardownTimeout` to finish.
  - Not covered: on Windows, a Vitest process killed outright can leave the compiler running for about 130 s.

- 5a7f226: **Breaking: vitest-native now requires React 19 and supports React Native Testing Library 13 or 14, and the native engine requires React Native 0.86+.** An older React or React Native stops at startup with `UNSUPPORTED_PEER`, for example `react-native 0.85.3 is not supported: the native engine supports react-native 0.86–0.88`; `vitest-native doctor` reports the same.

  Upgrade to React Native 0.86 or later (Expo SDK 57 or later) and React 19, and move from React Native Testing Library 12 to 13 or 14.

  - Testing Library 14 makes `render`, `fireEvent` and `act` async: `await render(<App />)`.
  - The mock engine runs on any React Native.
  - Testing Library outside 13–14, React Native above 0.88, or an Expo SDK other than 57 and 58, warns rather than fails.

- 25f0147: **Under the native engine, a test file that imports `react-native` now loads only the React Native modules it uses.** No action needed.

  - Each export is read when a test uses it, as under Jest, instead of all at once on import, which loaded React Native's whole module graph.
  - A change made to an export on the real `react-native` module is now visible through `import { … } from "react-native"` too.

- 2b764f1: **Breaking: vitest-native now requires Vitest 5 and Vite 8.** Vitest 4, or Vite 6 or 7, stops at startup with `UNSUPPORTED_PEER`, naming the supported range; `vitest-native doctor` reports the same.

  Install `vitest@^5` with matching `@vitest/*` packages, and `vite@^8.0.5`.

  - Vitest 5 clears mocks before every test (`clearMocks: true`). A suite that asserts on calls recorded before the test started sets `test.clearMocks: false`.
  - The plugin turns on Vitest 5's `fsModuleCache` unless the config sets `test.fsModuleCache` or `test.experimental.fsModuleCache`.
  - Babel plugins your tests need go through `@rolldown/plugin-babel`; `@vitejs/plugin-react` 6 removed its `babel` option.

### Patch Changes

- 2560a79: **`vitest-native doctor` no longer misreads a config whose binding has `$` in its name.** It reads bindings from the config's source with regular expressions, and `$` is legal in a JavaScript identifier but an anchor in a pattern. So `import $base from "@scope/preset"; export default $base` was reported as unconfigured. An aliased `reactNative as $rn` or `import * as $vn` was reported as imported but never called. Bindings are now escaped before they are matched. No action needed.
- b00e2df: **`vitest-native doctor` no longer reports `does not import vitest-native` for a config that builds on a shared module through a relative import**, such as a monorepo package's config merging `../../vitest.shared.ts`. doctor follows the config's relative imports up to three levels deep and reports the module that calls `reactNative()`. When it can't settle the question (an import that doesn't resolve, or a deeper chain), it says it couldn't confirm. No action needed.
- b532d38: **`hotRuntime.freshRuntime` now declines, with one line naming the presets, while a preset whose module uses React is active, instead of failing later files with "Invalid hook call".** Those presets' modules keep the first file's React, so under `freshRuntime` every later file on a hot worker failed with "Invalid hook call" or read a default value (navigation's `useTheme` returned `DefaultTheme`). The affected presets are navigation, expo, screens, svg, vector-icons, webview, mmkv, unistyles, flash-list, gesture-handler, reanimated and bottom-sheet, and safe-area and keyboard-controller when the installed library ships no built Jest mock (such as `react-native-safe-area-context` before 5.8.1, which Expo SDK 57 pins). React then stays resident, as without `freshRuntime`. No action needed.
- 5d16f28: **Under the hot runtime, an ES module dependency that imports a preset package now sees the running test file's preset mock, not the first file's.** Before, from the second file on a hot worker, such a dependency read another file's mock: `mockReturnValue`, `setInsets` and similar changes did not reach it, and call assertions such as `toHaveBeenCalled` missed its calls, so `not.toHaveBeenCalled` could pass when it should have failed. This affected only ES module builds in `node_modules` that import a preset package (for example `react-native-safe-area-context`), and only under `hotRuntime`; CommonJS dependencies and per-file runs were not affected. No action needed.
- 68b2018: **`migrate` keeps Jest's `moduleNameMapper` order in `resolve.alias`.** Both take the first match, but the suggested config listed a catch-all such as `@` ahead of an anchored `/^@\/assets\/(.*)$/`, so `@/assets/x` resolved to `src/assets/x`. Run `vitest-native migrate` again, or move the specific entries above the catch-all by hand.
- 28c715b: **`projectBabel` checks each file against the project root once per run.** Ruling out a file outside the root can take native `realpath` calls, and both the transform cache key and the load hook asked for every module. No action needed.
- 6dbaa56: **A Reanimated derived value now follows the shared values it reads, without a render.** `useDerivedValue` ran its updater only when the component rendered, so `progress.set(0.5)` followed by a read of the derived value gave the old result. A child React skipped (memoized, as React Compiler does) kept its first result, so Skia props and assertions saw stale values. It now reruns when a shared value it read changes, as Reanimated's mapper does, with or without the worklets Babel plugin. This covers Reanimated 4.7's own mock and the built-in preset for older versions. No action needed.

- 98381c9: **Reanimated's layout animations, `Keyframe`, `useAnimatedRef` and worklet runtimes behave as Reanimated's own under the native engine.** Its test mock gave one shared object per builder, so `new FadeIn()`, `instanceof FadeIn` and a class that extends a builder failed; `useAnimatedRef()` was not a function ref; and `createWorkletRuntime` / `runOnRuntime` did nothing. No action needed.

  - Builders are Reanimated's own classes; the static chains (`FadeIn.duration(300)`) work as before.
  - `runOnRuntime(runtime, worklet)` returns a function that runs the worklet.

- cf43f5f: **A cold run with root `__mocks__` no longer warns that a sourcemap points to missing source files.** The module jest-compat generates for root manual mocks, `vitest-native.root-mocks.mjs`, has no file on disk, so Vite looked for its source there on the first run after a cache clear and in CI. No action needed.
- c0e54bd: **The presets guide lists the supported Reanimated, Worklets and Gesture Handler versions.** Each floor is what Expo SDK 57, the oldest supported SDK, ships, and each ceiling is below the next major. No action needed.

  - `react-native-reanimated` `>=4.5.0 <5`, `react-native-worklets` `>=0.10.0 <1`, `react-native-gesture-handler` `>=2.32.0 <4`.

- e37eaf7: **A Reanimated mock that spreads `jest.requireActual('react-native-reanimated')` works on Reanimated 4.5 and 4.6.** On those versions the engine dropped the project's `react-native-worklets/plugin` (and the one `babel-preset-expo` adds), so the real `useAnimatedStyle` threw "used without a dependency array or Babel plugin" where Jest passed. The plugin is now applied whenever Reanimated or Worklets is installed. No action needed.

- f8d18c2: **`presets: { gestureHandler: false }` no longer turns off Gesture Handler's own Jest setup under the native engine.** A project that kept the setting from older mocks lost the setup too, so Gesture Handler's native module was the engine's generic stub and it warned `Failed to install UI runtime bindings`. `flashList: false` behaves the same. No action needed.
- e88bbd0: **Under the hot runtime, RNTL's auto-cleanup works in every file again.** The hot reset put back Vitest's own worker state from the first file on a worker, so later files read that file's module graph. When the first file opted out with `dont-cleanup-after-each`, every later file on the worker lost auto-cleanup, and a test's components stayed mounted into the next. The reset now leaves Vitest's globals alone, and fails a file by name if Vitest's worker state names another file. No action needed.
- 6d8ec6a: **Every Reanimated hook that gives a shared value now gives one with Reanimated 4's shape under the native engine.** Reanimated's test mock gave plain values from `useTimestamp`, the scroll offsets, `useAnimatedKeyboard` and `useAnimatedSensor`, and shared values without `modify()`, listeners or the `isSharedValue()` mark, so app code calling `.get()` failed. No action needed.

  - Covers `useSharedValue`, `useDerivedValue`, `useScrollOffset`, `useScrollViewOffset`, `useTimestamp`, `useAnimatedKeyboard`, `useAnimatedSensor` and `makeMutable`.
  - A mock that already gives the right shape keeps its own.

- d07f8c1: **A machine going to sleep mid-run no longer slows the run that follows.** On macOS, Node's clocks count time asleep, so precompiling React Native looked like it had overrun its time limit and was stopped on wake. The run then loaded React Native file by file, and its duration, which included the sleep, read as a stall of over ten minutes. Time limits now leave out time the machine spends asleep, and a precompile that still fails says how long the machine slept. A run also stops retrying a precompile that has already failed. No action needed.
- 19b3f5e: **Vitest below 5.1.0 now gets one startup warning and a `doctor` entry, naming the bug it avoids.** With Vite 8.3.5 or later, Vitest 5.0.x can hide a startup error behind "No test files found" and a formatter crash (vitest-dev/vitest#11682, fixed in 5.1.0). Vitest 5.0.x still runs: 5.1.0 is the recommended version, and 5.0.0 stays the minimum. Upgrade Vitest to 5.1.0 or later to avoid it.

- aae2bfd: **The documentation moved to [vitest-native.danfry.dev](https://vitest-native.danfry.dev).** The links in vitest-native's messages, the README and npm's Homepage link now point there. The old address, `danfry1.github.io/vitest-native`, redirects each page to the same page on the new site, anchor included, so links printed by earlier versions keep working. No action needed.
- b79416e: **`vitest-native doctor` reports a missing `@babel/core` with the engine's own startup notice, once.** It then lists each Babel plugin or preset that therefore goes unapplied, instead of repeating the install advice on every line. No action needed.
- c8ed918: **Under the hot runtime, a file that mocks `react-native` partially no longer breaks RNTL in later files.** When RNTL first loaded in a file with `jest.mock('react-native', () => ({ Platform: … }))`, it kept that mock for the worker's life, and later files failed in `fireEvent` with `Cannot read properties of undefined (reading 'flatten')`. React's, its renderers' and RNTL's own requires now get the actual module under hot; the file's code still gets its mock. No action needed.
- c43384f: **A factory-less `jest.mock('pkg')` now automocks `pkg` for `require()` too, as under Jest.** Before, only the test's imports got Vitest's automock: a `require('pkg')` in the test or in an installed package got the real package. The mock is now one automocked instance that every load in the file shares. No action needed.

  - Applies to an installed package with no manual mock; a manual mock still wins.
  - Relative or aliased project modules, Node core modules and `react-native` keep Vitest's own handling.

- 1286bab: **Under the hot runtime, a test file no longer fails to load with "TypeError: #<Object> is not an integer typed array".** When Vite evaluated an installed ES module that Node had already imported in the same worker, the `SOURCE_EVALUATED_TWICE` check read the hot runtime's generation from the wrong object and threw. Which file failed depended on the files that ran before it in the worker. No action needed.
- 4c09d68: **`vitest-native migrate` names each `jest.mock()` factory that reads a module-level `const`, `let` or `class` while it runs.** Mock factories run before the test file's body, so under Vitest such a read throws "Cannot access '…' before initialization". Under Jest it often read `undefined` instead, because React Native's Babel preset compiles `const` to `var`. Reads inside a function the factory returns are not reported. Move the value into the factory, or create it with `vi.hoisted()`.
- a1e74a7: **A project with a Babel config no longer fails every test file when a plugin serves a module under the project root.** Most visibly: with a root `__mocks__` for an installed package and `jestMockTransform()`, each file failed with `ENOENT … vitest-native.root-mocks.mjs`. The `projectBabel` and project `.js` JSX load hooks now leave an id with no file on disk to the plugin that serves it. No action needed.

- 3fbe353: **`vitest-native compare` no longer misses an error in `vitest run`'s output when stdout and stderr interleave.** The two streams were split into lines through one shared buffer, a chunk was decoded on its own, and an error header's message was taken from the next line of either stream. Depending on how the pipes delivered output, an `Uncaught Exception` or `Unhandled Rejection` could be dropped from the verdict. Each stream now has its own line buffer, UTF-8 decoder and pending header. No action needed.
- 587167d: **A test file that fails because a module does not compile now names that module's file, line and column.** A decorator or other syntax that reached Node uncompiled failed the file with only `SyntaxError: Invalid or unexpected token`. The report now reads `SyntaxError: Invalid or unexpected token (src/model/Subscription.js:24:3)` and shows the source line, mapped through the module's sourcemap. No action needed. A project that sets its own `test.runner` keeps Vitest's message.
- b9a5b67: **A `jest.mock` factory that `require`s your own source now gets the module the test imports.** With `jestMockTransform()`, a `require('<path>')` in a factory's body loads through Vite, as its `jest.requireActual` calls already do, or returns the mock where the file mocks that module. It used to load a second copy through Node, with its own module state, and a SOURCE_EVALUATED_TWICE warning was printed for every file that copy imported: thousands of lines on a large suite. No action needed.
- b3ec366: **The `SOURCE_EVALUATED_TWICE` warning prints one entry per cause instead of one per file.** Files Node loaded through the same first `require()` are grouped: the first is printed in full, and the end-of-run summary gives each cause one line with its file count, its test files and the fix. On a large suite, one `jest.mock` factory's `require` could print thousands of warnings; it is now one summary line and one warning per worker. The fix line names `await vi.importActual(...)` in an async factory, or `experimental.ownershipModel: 'resolution'`. No action needed.
- a1e57a8: **The `IMPORT_META_IN_NODE_OWNED` error now names the whole fix for a package published as an ES module.** For a `"type": "module"` or `.mjs` package, `transform: { exclude: [...] }` alone left the package to Node, uncompiled, where `import.meta.env` is undefined. The message and the [error reference](https://danfry1.github.io/vitest-native/guide/errors#IMPORT_META_IN_NODE_OWNED) now say so. Add such a package to `test.server.deps.inline` as well as to `transform.exclude`, so that Vite loads it.
- 1effb20: **Under the native engine, checking whether Node compiles a file no longer grows with the number of React Native packages.** The check runs on every file Node resolves or loads. It used to test each file against two patterns per package, hundreds on an Expo project. It now looks the package name up after each `node_modules` segment, and checks the file's parent directories against the linked packages' directories. No action needed.
- 8122180: **`projectBabel` no longer compiles a file with Babel because a comment in it holds an `@` tag.** A config with legacy decorators sent every file with a `// @ts-ignore` or a JSDoc `@param` through Babel. On one large app, 48 of 64 such files had no decorator. A tag after `//`, on a JSDoc line or inside a `/* … */` on the same line no longer counts. No action needed.
- 5d45540: **A project whose Babel config lists `@babel/plugin-transform-dynamic-import`, or turns babel-preset-expo's native module transform back on, loads its files again.** Since `projectBabel`, every file that config applies to failed with `@babel/plugin-transform-dynamic-import depends on a modules transform plugin`, because the module transform is left out so the output stays an ES module. The dynamic-import transform is now left out with it, as `import()` runs as written, and babel-preset-expo's per-platform `disableImportExportTransform` is turned on too. No action needed.
- 3a0143c: **`require('@jest/globals')` gets jest-compat's shim, as an import does.** A CommonJS `require` of it reached the installed package, which throws outside Jest, so a `.js` test that required it did not load. It now returns the same module as `import … from '@jest/globals'`, under both engines.

  No action needed.

- fde2449: **`vi.resetAllMocks()` no longer loops forever with a `jest.spyOn` spy under jest-compat.** A spy on an arrow function, or any function `new` cannot construct, put itself back in the set of mocks Vitest was resetting. The reset then never returned and the worker spun at full CPU, most often under the hot runtime, where a spy from an earlier file is still alive. Resetting now ends, and the spy still falls back to its original as before.

  No action needed.

- 63a2021: **A `jest.mock` of a `react-native/Libraries/...` path now replaces the module `import { … } from 'react-native'` returns, as under Jest.** A mock of a module with platform files, such as `react-native/Libraries/Utilities/BackHandler`, applied to `BackHandler.js` while React Native loads `BackHandler.ios.js`, so `BackHandler.mockPressBack` was undefined. It now lands on the platform file, cold and under the hot runtime, and so does `vi.mock` with `experimental.nodeMocks`. A `jest.mock` inside a helper the test calls now applies when the helper runs, instead of failing with "defined outside of the module's top level scope". Remove any workaround that mocked the `.ios.js` file directly.
- a1e57a8: **A project reached through another spelling of its path is recognised everywhere vitest-native asks whether a file belongs to it.** Such spellings include a Windows short (8.3) name such as `C:\Users\RUNNER~1\...`, the default temporary directory on GitHub's Windows runners, and a symlinked or junctioned directory. Paths were compared as plain strings, so files Vite names by their long, real path were missed. No action needed.

  - App source Node loads uses your Babel config again, with its presets, macros and plugins, including `babel-preset-expo`. Files `projectBabel` compiles parse, and `.babelrc` files are read. Asset locations resolve too.
  - The checks that decide whether Vite or Node loads a file, the require bridge, the warning about Node resolving the package under test, the setup-file check and `vitest-native compare` match either spelling.
  - The `SOURCE_EVALUATED_TWICE` guard reports a file evaluated twice, and `ownership.allow` entries match either spelling.

- d406ffe: **Under the native engine, each test worker works out which packages Node compiles once, from directories the plugin already resolved.** A worker used to resolve the directory of every package Node compiles twice per test file, once for its ES module loader and once for its `require` hooks. With per-file isolation every test file has a new worker, so the cost grew with the number of test files. The plugin now records those directories for its workers, and the two hooks share one answer per worker. No action needed.

- a107e3a: **`vitest-native init`, `doctor` and `migrate` now refuse a flag they do not take, instead of ignoring it.** A typo such as `migrate --wirte` used to run a dry report without saying so; it now exits 1 with `✗ unknown option --wirte for migrate. Valid: --root, --help, --write, --force.` Check scripts that pass extra flags to these commands. Change any misspelled flag to one the error lists.
- b388ce5: **`vitest-native doctor` now warns on Node 24.13.0, which can crash a test run at startup with a segmentation fault.** The crash is in V8's garbage collector on a worker thread and is intermittent. Use another Node 24 release, such as 24.14 or later; the troubleshooting guide has the details.
- 0ed099c: **`ErrorCode` now includes `HOT_RESIDENT_UNUSABLE` and `HOT_FILE_NOT_RUN`, two codes the hot runtime already throws.**

  Code that narrows `error.code` can now name them. No action needed. Every code is described in the new [error-code reference](https://danfry1.github.io/vitest-native/guide/errors).

- 1c2171a: **Under the hot runtime, `@testing-library/react-native/dont-cleanup-after-each` now keeps a file's render in every file, not just the first on a worker.** A file that shares one render across its tests found it unmounted after the first test when it was not the first file its worker ran. Delete any `vi.stubEnv('RNTL_SKIP_AUTO_CLEANUP', 'true')` added as a workaround.
- ad5d90c: **`init` and `migrate --write` say when the new config takes over from a `vite.config.*`.** Vitest reads a `vite.config.*` only when there is no `vitest.config.*`, so its plugins, `resolve` options and aliases silently stopped applying to tests. The CLI now names the file Vitest loads instead and shows how to extend it with `mergeConfig`. Under Vite+, a project with both files is told about the `vitest.config.*` that Vitest loads.

  To keep the Vite config's plugins and aliases in tests, use `mergeConfig` as the CLI shows.

- 8bef987: **Installs now get `magic-string` 1.4.5 (was 1.4.4), the library the `jest-compat` transform uses to hoist `jest.mock` calls in test files.**

  No action needed.

- 1c3e3a7: **Messages that point at documentation now link the published site.** No action needed.

  - `JEST_API_UNSUPPORTED` links its entry in the error reference, and the message for a package Node cannot run links the page on untranspiled packages.
  - `vitest-native compare`'s snapshot hints link the snapshots section of the Jest migration guide, in place of a section number the guide no longer has. Its refusals of `--jest-args` and `--vitest-args` link the `compare` reference.

- 834a146: **`init --force` and `migrate --write --force` replace the config Vitest loads.** With an existing `vitest.config.ts`, they wrote `vitest.config.mts` beside it and reported it replaced, but Vitest kept loading the `.ts`, so the config did not change. They now write over the file Vitest picks first, under its own name. A CommonJS `vitest.config.cjs` or `.cts` is refused with a message instead.

  No action needed.

- 3ba30c4: **`vitest-native migrate` translates more of a Jest config, and lists the Reanimated settings vitest-native covers as safe to delete.** No action needed.

  - A local preset such as `./jest.preset.js` is read as Jest applies it: one spreading `jest-expo` translates as `jest-expo`; one spreading no known preset is translated and flagged for review.
  - A `'^prefix/(.*)$'` mapper becomes a `resolve.alias` for any prefix, and a `$`-anchored `testPathIgnorePatterns` literal a `test.exclude` glob when that skips no directory.
  - Where the Reanimated preset applies, Reanimated's Jest `resolver`, a serializer that only strips animated props and a setup file that only calls `setUpTests()` are listed as covered.

- 5cad255: **Native engine with `experimental: { nodeMocks: true }`: a `vi.mock` or `jest.mock` reaches modules Node loads, as `jest.mock` does under Jest.** To try it, set the flag.

  - An installed package's `require` or `import` of a mocked module gets the test's mock, the same instance. This covers factories, automocks, `{ spy: true }` and `__mocks__` files.
  - A mock Node cannot be handed synchronously fails by name, `MOCK_NOT_SEEN_BY_NODE`, instead of loading the real module. Examples are an async factory that has not settled, or a `vi.doMock` not yet applied.
  - An installed package's TypeScript source loads once when a test both requires and imports it.

- 4271252: **Under the native engine, a package whose `react-native` field and `main` name different files is one module, imported or required.** No action needed.

  - A bare `require` resolves the `react-native` field, as Metro and an `import` do, for a package that depends on React Native or has a TypeScript entry. Before, a library's require and a test's import held separate copies.
  - `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))` works, as under Jest.
  - Other packages keep `main`, and `require.resolve` with `paths` is unchanged.

- 499f888: **JSX in your project's own `.js` files now compiles, as Metro and babel-jest compile it.** A `jest.setup.js` that renders a provider, a `.js` test, or a `.js` component imported by a test used to fail with `Failed to parse source for import analysis`. Remove any rename to `.jsx` or `oxc.include` override added as a workaround. Files in `node_modules` are unchanged; packages that ship JSX in `.js` still go in [`transform`](https://danfry1.github.io/vitest-native/guide/plugin-options#transform).

## 0.14.1

### Patch Changes

- 0dd12ca: **Native engine: a React Native package's required peer that your package manager installs for you (pnpm, npm 7+ and bun do), such as expo-router's `expo-linking`, is now compiled.** No action needed. Remove `transform: ['expo-linking']` if you added it for this.

  - Before, a required peer that no `package.json` declared stayed uncompiled. It then failed with "Cannot require() ES Module … not yet fully loaded" or "Cannot find module …/Linking.types".
  - Optional peers, and peers a package names only in its config plugin, scripts or types, are still not followed.

  Thanks @AntSplash360 for reporting this (#296).

- 967d3cf: **Under the native engine, a relative import whose name has a dot, such as `./Linking.types`, now resolves.** A package that Node loads as an ES module failed with "Cannot find module …/Linking.types" because the part after the dot was read as a file extension. Only a known source or asset extension counts now, as in Metro, so `./Linking.types` finds `Linking.types.js`, and a platform variant such as `Theme.config.native.js` wins over `Theme.config.js`. No action needed.

  Thanks @AntSplash360 for reporting this (#296).

- 8ea7273: **`vitest-native migrate` now reads `jest.config.ts`, `.mjs`, `.mts` and `.cts`, in Jest's own lookup order.** TypeScript configs load through Node's type stripping (Node 22.18 or later). A config that still can't be loaded, such as one that relies on ts-node (an extensionless relative import, an `enum`), uses top-level `await` or exports a function, is now listed under "Needs your attention" with the reason, where before the report silently left out its settings. No action needed.

- e5ff183: **`vitest-native migrate` now warns when the project's Babel config makes imports lazy under Jest.** With `babel-preset-expo`'s `lazyImports`, `@react-native/babel-preset`'s `lazyImportExportTransform`, the CommonJS transform's `lazy` option or an inline-requires plugin, Jest ran a package import only when a test first used it, while vitest-native runs every import when its file loads. A module a test never touched is then evaluated, and a partial `jest.mock` of something it needs can fail. The report now lists the setting under "Needs your attention". Babel plugin names under the `@babel/` scope are also now read the way Babel reads them.

  Use `jest.requireActual` to give such a mock the rest of its module: `jest.mock('x', () => ({ ...jest.requireActual('x'), ... }))`.

## 0.14.0

### Upgrading from 0.13

- **Node 22.13 or later on Node 22, or Node 24.3 or later.** `engines.node` is
  `>=22.13.0 <23 || >=24.3.0` (it was `>=20.19.0`): Node 20 reached end of life in April 2026, and
  on Node 24.0–24.2 `jest.mock`, `jest.isolateModules` and `jest.resetModules` do not reach modules
  Node loads. `vitest-native doctor` checks the range.
- **Per-file isolation stays the default.** `hotRuntime` defaults to `false`, as in 0.13.0: under
  the native engine each test file runs in a fresh worker. The hot runtime, which reuses workers
  across test files instead of starting a fresh one per file, is available with `hotRuntime: 'auto'`;
  whether it is faster depends on the suite, so measure it on yours. Five known
  differences from per-file isolation are listed in
  [troubleshooting](https://danfry1.github.io/vitest-native/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files).
  Early 0.14.0 release candidates defaulted to `'auto'`; set `hotRuntime: 'auto'` to keep the hot runtime.
- **How to tell.** When the hot runtime is active, the startup banner names it, as in
  `(platform ios, hot runtime)`. With `'auto'`, it keeps Vitest's per-file isolation whenever the run
  cannot be bounded, or when you set a pool or `test.isolate` yourself, and prints the reason.
- **Hot workers leave Node's compile cache off when they re-evaluate ES modules**, so the cache no
  longer grows with every test file. It costs about 15–20 ms per worker boot;
  `hotRuntime: { esmGeneration: false }` keeps the cache on.
- **Hot workers no longer keep a copy of every CommonJS package each file imports**, on Node
  22.22.3+, 24.12+ and 26, so a suite importing large packages no longer recycles workers every few
  files.
- **`hotRuntime: { mode: 'auto', memoryLimit }`** runs hot with your recycling options where the run
  can be bounded and keeps per-file isolation where it cannot. Without `mode`, the object form still
  requires the hot runtime.
- **A test that times out inside `act()` retires its hot worker**, so later files on that worker no
  longer fail with `Unable to find an element with text: …`.
- **Coverage works under the native engine.** With `provider: 'v8'`, files Node compiles, such as a
  React Native workspace package, are reported against their source lines.
- **A project file imported and required in one test is one module.** Under the native engine, with
  or without jest-compat, `vi.spyOn`, export assignments and `instanceof` reach both sides, as under
  Jest.
- **Vite+ projects start.** The Vite and Vitest versions are read from the running instances, so
  Vite+ no longer fails with `UNSUPPORTED_PEER`. Two physical copies of Vitest stop the run at startup
  with `VITEST_TWIN_INSTANCE`, naming both.
- **Expo SDK 57 and 58 are the supported SDKs.** On an older or newer SDK the plugin prints one
  warning per run naming them, and `vitest-native doctor` reports it; tests that load Expo modules
  can fail there. A test that loads `expo` or `expo-modules-core` from another SDK, for example through
  a library, also warns, naming the version and path. Upgrade to Expo SDK 57 or 58.
- **The package is about 30% smaller** and no longer ships `CHANGELOG.md`; the changelog is
  [on GitHub](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/CHANGELOG.md).
- **RNTL works without jest-compat or globals.** `findBy*`, `waitFor` and `userEvent` advance
  `vi.useFakeTimers()`, and RNTL's auto-cleanup runs without `test.globals: true`. A suite that relied
  on trees staying mounted between tests imports `@testing-library/react-native/pure`.
- **Expo path aliases resolve.** In an Expo project on Vite 8, imports through tsconfig `paths` (the
  template's `@/…`) now resolve as Metro resolves them; a `vite-tsconfig-paths` plugin or a hand-written
  alias for them can go.
- **Vitest 5 keeps transformed modules on disk.** The plugin turns on Vitest's `fsModuleCache` unless
  your config sets it, keyed so that upgrading vitest-native or any dependency invalidates it. Set
  `test.fsModuleCache: false` to opt out.
- **react-native-mmkv 3 and later run as themselves.** They detect Vitest and use their own in-memory
  backend, so the `mmkv` preset now applies to mmkv 2 only. Tests get mmkv's real API (v4's `remove`)
  and change listeners instead of the preset's approximation.
- **jest-compat follows Jest more closely.** A name a `jest.mock` factory leaves out is `undefined`
  instead of an error, `new` on a `jest.fn` with an arrow implementation works, and
  `process.env.JEST_WORKER_ID` is set, so code that checks for Jest takes its test branch.
- **`hotRuntime: true` is stricter.** Combined with a configured pool, `test.isolate`, or a conflicting
  CLI flag, it now fails at startup with `HOT_RUNTIME_OVERRIDDEN` instead of warning and overriding.
- **Native modules answer as on a device.** Under the native engine, `NativeModules[name]` and
  `TurboModuleRegistry.get(name)` are `undefined`/`null` for a module no app registers, and a React
  Native module's stub has only the methods its codegen spec declares. Register a module a test needs
  with `mockNativeModule(name, impl)`; `nativeModules: 'permissive'` restores the earlier behaviour.
- **Assets are registered ids.** `require('./logo.png')` evaluates to the id React Native assigned
  when registering the asset, as with Metro, instead of the file name. Snapshots that contained an asset's name
  change; re-record them with `-u`.
- **`jest.mock` reaches `require()`.** With jest-compat, a `jest.mock` factory now applies to
  `require()`, `jest.requireActual`'s dependencies and React Native's own requires of a mocked internal;
  `jest.isolateModules` and `jest.isolateModulesAsync` work. TypeScript app files that Node loads are
  compiled with the project's Babel config, as babel-jest compiles them.
- **Unistyles and Skia are mocked automatically.** The new `unistyles` and `skia` presets are
  auto-detected. Remove Unistyles' `react-native-unistyles/mocks` setup file, whose `jest.mock()` calls
  would replace the preset (`vitest-native migrate` removes it), and a hand-written Skia mock, which the
  preset replaces. Skia's preset loads CanvasKit before each test file, about 20–30 ms;
  `presets: { skia: false }` turns it off.
- **Presets of your own are listed by path.** A preset object of a project's own passed to `presets`
  used to shadow its packages with undefined exports; it is now refused at startup. List the module that
  exports it instead: `presets: { './test/presets/my-lib.ts': true }`.
- **A deep import of a preset package loads its real file.** Under the native engine,
  `react-native-reanimated/src/…` and similar subpaths are the package's own files, as under Jest,
  not the root mock; import from the package root if a test relied on the mock. The
  `safeAreaContext` preset's hooks read their contexts, so call them inside a component or
  `renderHook`.
- **Expo SDK 57 and 58 projects run real React Native with nothing extra installed.** When
  `@react-native/babel-preset` does not resolve (`babel-preset-expo` no longer depends on it), the
  native engine compiles with Expo's preset, as Metro does. `reactNative()` used the mock engine there
  before.
- **Expo's globals are installed before your setup files, and `fetch` stays Node's.** A `fetch` mocked
  in a setup file, an MSW server, nock and undici's `MockAgent` keep working whether or not a test
  imports `expo`. Every test file in an Expo project now sees Expo's `URL`, `structuredClone` and
  `DOMException` polyfills, as under jest-expo.
- **Expo's globals need `expo` declared.** The native engine installs Expo's runtime (`URL`,
  `structuredClone` and the other globals jest-expo installs) only when the project, or a manifest
  above it, declares `expo` or a package that depends on it, or `transform` names it. A project where
  `expo` merely resolves, for example beside an Expo app in a hoisted workspace, no longer gets them;
  declare `expo` or add it to `transform` if it relies on them.
- **Your Babel config runs on its own thread.** Under the native engine, Babel runs apart from the
  tests, as under Jest. A Babel config or plugin sees the Babel worker's `process.argv`,
  `isMainThread` is `false`, and the tests' `require.cache` and globals are not visible.
  `process.env` is shared. A transform slower than 60 s plus 15 s per MB of source fails with
  `TRANSFORM_FAILED`.
- **Expo modules' own native-module mocks are served.** Values that were `undefined` are the mock's
  (`digestStringAsync` resolves `""`), and a member a mock leaves out is `undefined` where the generic
  stub gave a function.
- **An optional native module that is not installed reads as absent.** `requireOptionalNativeModule`
  returns `null` for a module a package only probes for and no installed package defines, as on a
  device.
- **Expo modules run as their installed packages.** Under the native engine, the `expo` preset no
  longer replaces `expo-constants`, `expo-status-bar`, `expo-font`, `expo-asset`, `expo-splash-screen`
  and `expo-linking`, so their whole API is the installed SDK's (`hide()`, `setOptions()`,
  `useAssets` …) and their values are jest-expo's: `Constants.expoConfig` is `{}`,
  `Linking.createURL()` needs a scheme mocked into `expo-constants`, and `Font.isLoaded()` is `false`
  until a font loads. The Minor Changes entry lists each value; `presets: { expo: true }` keeps the
  preset while a suite moves off it.

### Thank you

Thank you to [@AntSplash360](https://github.com/AntSplash360), [@arvidtorbjoernsen](https://github.com/arvidtorbjoernsen), [@believer](https://github.com/believer), [@doutatsu](https://github.com/doutatsu), [@eshvatskyi](https://github.com/eshvatskyi), [@Joozty](https://github.com/Joozty), [@OpenDeernet](https://github.com/OpenDeernet), [@sincraianul](https://github.com/sincraianul) and [@swey](https://github.com/swey) for the issues and pull requests in this release.

### Minor Changes

- 271c149: **`hotRuntime: 'auto'` can take recycling options: `{ mode: 'auto', memoryLimit }`.** It runs hot with your options where the run can be bounded, and falls back to per-file isolation, printing why, where it cannot (one worker, `--pool`, `--isolate`). To use it, add `mode: 'auto'` to the object form.

  - Without `mode`, the object form still requires the hot runtime, as `true` does.
  - Not covered: `mode: 'auto'` with `allowUnboundedMemory`, which is rejected.

  Thanks @sincraianul for reporting this (#450).

- c9de648: **With `hotRuntime` on, the memory plan is sized for the workers that actually run, and a worker count you set is limited only by memory.** To keep the old ceiling of four, set `maxWorkers: 4`.

  - `--maxWorkers` and `VITEST_MAX_WORKERS` now reach the plan before any worker starts.
  - A count you set is bounded only by host or container memory: `maxWorkers: 16` on a 16 GB laptop runs 16 workers, each recycling at a 512 MiB heap. When memory lowers it, `hotRuntime capped maxWorkers from N to M` is printed.
  - On Vitest 5, a native project beside a plain project with no worker count set no longer fails with `Projects … have different 'maxWorkers' but same 'sequence.groupOrder'`. `hotRuntime: { allowUnboundedMemory: true }` still leaves the count to Vitest.

- 7cee4a7: **Breaking: vitest-native needs Node 22.13 or later on Node 22, or Node 24.3 or later (`engines.node` is `>=22.13.0 <23 || >=24.3.0`; it was `>=20.19.0`).** Upgrade Node if it is 20, 22.0–22.12, 23 or 24.0–24.2.

  - Node 20 reached end of life in April 2026, and Node 23 is past it. Node 22.13 is the first Node 22 that both RNTL 14 and the engine's CommonJS entry points (`require(esm)`) support.
  - On Node 24.0–24.2, `jest.mock`, `jest.isolateModules` and `jest.resetModules` do not reach modules Node loads, with either loader.
  - `doctor` checks the whole range. RNTL 12, 13 and 14 stay supported.

- 191c286: **Native engine: `expo-constants`, `expo-status-bar`, `expo-font`, `expo-asset`, `expo-splash-screen` and `expo-linking` run as their installed packages, as under jest-expo.** To keep the `expo` preset meanwhile, set `presets: { expo: true }`.

  - Their full API is present: `hide()` from `expo-splash-screen` was `undefined` (#319). Native modules come from the package's `mocks/` or jest-expo's SDK 57/58 table. See [How Expo modules run](https://danfry1.github.io/vitest-native/guide/expo#how-expo-modules-run).
  - `Constants.expoConfig` is `{}`, `appOwnership` `null`, `executionEnvironment` `'mock'`; `Font.isLoaded()` is `false` until a font loads, and `Asset.fromModule()` of a number that is not a bundled asset throws (it returned a made-up asset); `preventAutoHideAsync()` and `hideAsync()` resolve `undefined`.
  - `Linking.createURL()` and `Linking.parse()` throw without a scheme: `jest.mock` `expo-constants` with one, or mock `expo-linking`. `vi.mock` does not reach it yet (#322).

  Thanks @arvidtorbjoernsen for reporting this (#319).

- 7b9b795: **React Native 0.88 and Expo SDK 58 join the supported matrix; the verified React Native range is now 0.81–0.88.** No action needed.

  - All 85 cross-check probes match on 0.88, and `check-compat` covers every stable export.
  - The packed Expo consumer moves to SDK 58 (React Native 0.88, RNTL 14), with an SDK 57 consumer alongside. It checks that the presets provide every `expo-linking` and `expo-constants` member expo-router uses, and that loading `expo` and `expo-router` leaves Node's timers and `Promise` in place.

- 13f79b0: **Native engine: an Expo module whose package ships a mock of its native module (`mocks/<Name>.ts`) gets that mock, as under jest-expo.** Importing `expo-file-system/legacy` threw `p.replace is not a function`. No action needed.

  - Applies to `expo-crypto`, `expo-file-system`, `expo-clipboard`, `expo-localization` and others. Functions are `vi.fn`s that return the mock's values and reset between test files, classes keep their prototype, and members the mock leaves out are `undefined`.
  - Native modules without a package mock keep the generic stub.

- f107c6a: **A `unistyles` preset for `react-native-unistyles` 3, auto-detected when installed, so components using Unistyles load in tests.** Remove `react-native-unistyles/mocks` from your setup files; `vitest-native migrate` deletes it.

  - It covers Unistyles' own Jest mock (`StyleSheet.configure`, `StyleSheet.create`, `useUnistyles`, `withUnistyles`, `UnistylesRuntime`) and follows the library's source beyond it: breakpoints, `mq`, variants, adaptive themes, `ScopedTheme`, `Display` and `Hide`. See [Unistyles](https://danfry1.github.io/vitest-native/guide/presets#unistyles).
  - `resetAllMocks()` returns the theme to what `StyleSheet.configure()` set.
  - `migrate` deletes a library's own test setup file when a detected preset replaces that library, since its `jest.mock()` calls would replace the preset.

  Thanks @believer for asking for this preset (#286).

- 12a6dc5: **A `skia` preset for Skia, which threw `Native Skia Module failed to correctly install JSI Bindings` at import in tests.** It covers `react-native-skia` (2.15.0 and 3.x) and `@shopify/react-native-skia` (up to 2.14.0) under both engines. Remove a hand-written Skia mock.

  - It serves Skia's own test mock over CanvasKit (Skia in WebAssembly), so the `Skia` API computes for real and `Canvas` renders as Views. It adds Skia's Reanimated helpers (`usePathValue`, `useTexture`, …) and a `matchFont` that returns a font.
  - `Preset` gains an optional async `prepare()`, run before any setup or test file; `PresetModule` an optional `exportsFor()`, which reads named exports from the installed package.
  - Workers take the project root from `test.root` (or `--root`), as Vitest does.

  Thanks @believer for asking for this preset (#286).

- 51c351d: **Presets of a project's own work when listed by the path of a module that default-exports them.** Use `presets: { './test/presets/my-lib.ts': true }` beside auto-detection, or `presets: ['./test/presets/my-lib.ts']` in a full list.

  - A preset object passed to `presets` shadowed its packages with undefined exports under both engines, because workers rebuild presets by name. Such an object, including a built-in preset copied or extended, is now refused at startup, naming the module form.
  - The module may export the preset or a function returning it. Each worker imports it through Vitest, so a TypeScript module loads.

- 6724815: **Native engine: `NativeModules[name]` is `undefined` and `TurboModuleRegistry.get(name)` is `null` for a module no app registers, as on a device and under Jest.** Use `mockNativeModule(name, impl)` from `vitest-native/helpers` to register a module a test needs; `nativeModules: 'permissive'` restores the earlier behaviour.

  - React Native's own native modules stay present, read from the installed `react-native`. Each stub has only its codegen spec's members; any other property is `undefined`.
  - `TurboModuleRegistry.getEnforcing(name)` still returns a stub for any name.
  - A `mockNativeModule()` registration answers all three lookups; under the hot runtime it is removed before the next file.

- 3d20592: **jest-compat: a `jest.mock` factory applies to `require()`, to the modules `jest.requireActual` loads, and to React Native's own requires of a mocked internal, as in Jest.** Add `jestCompatSetup` to `test.setupFiles`, before any setup file that calls `jest.mock`, if a `jest.mock` factory fails with `JEST_COMPAT_SETUP_MISSING`.

  - `jest.requireActual` unmocks only the module requested, `jest.requireMock` returns the mock, `jest.resetModules()` gives `require()` fresh project modules, and `jest.isolateModules` and `jest.isolateModulesAsync` work. Registrations last one test file; factory-less mocks still apply to imports only.
  - TypeScript project files Node loads compile as babel-jest compiles them; a file the Babel config ignores fails with `Babel ignores …`.
  - Relative requires from files Node loads resolve as Metro resolves them. See [jest-compat](https://danfry1.github.io/vitest-native/guide/jest-compat).

- 12d413a: **Assets evaluate to a registered asset id, as Metro gives an app, instead of the file name.** `require('./logo.png')` is a number, so `Image.resolveAssetSource(require('./splash.png'))` resolves instead of returning `null`. Update snapshots that contained an asset's name with `vitest -u`.

  - The descriptor is Metro's (`name`, `type`, `scales`, `hash`, `httpServerLocation`, and `width`/`height` read from PNG, JPEG, GIF, BMP and WebP). `@2x`/`@3x` and `.ios`/`.android` variants resolve as in Metro; Expo projects add Expo's `fileHashes`.
  - Native engine: assets register with the module Metro's `assetRegistryPath` names. Mock engine: with the mock `AssetRegistry`, which now keeps entries across `resetAllMocks()`.
  - Ids follow registration order within a file. Compare `Image.resolveAssetSource(asset).uri` instead of a file name. See [Assets](https://danfry1.github.io/vitest-native/guide/how-it-works#_2-assets).

- 52e80aa: **Vitest 5: the plugin turns on Vitest's persistent transform cache (`fsModuleCache`) unless your config sets it.** Set `test.fsModuleCache: false` to opt out.

  - The cache key adds the vitest-native version, the plugin's resolved options and a digest of the lockfile, so upgrading vitest-native or a dependency invalidates it.
  - Warm runs of a 104-file production Expo suite were about 11% faster.

- 87d8dd0: **`hotRuntime: 'auto'` also uses the hot runtime for suites set up with `jestMockTransform()` or the jest-compat setup.** Set `hotRuntime: false` for a suite that needs per-file isolation.

  - Checked across files: `jest.mock` in its hoisted, partial, factory-less and runtime forms, spies on React Native APIs, `console` and package exports, fake timers and `jest.setSystemTime`, `jest.setTimeout`, globals, `process.env`, snapshot state, RNTL cleanup, and a setup file's top-level mocks, matchers and globals.

- d0d968a: **Native engine: `hotRuntime: 'auto'` reuses workers across test files wherever the run can be bounded. The default stays `false`, as in 0.13.** Set `hotRuntime: 'auto'` to opt in; known differences are listed in [troubleshooting](https://danfry1.github.io/vitest-native/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files).

  - `'auto'` needs two workers within the memory plan, no explicitly selected pool, and one Vitest version in workers and project; otherwise it keeps per-file isolation and prints why. It decides after other plugins' config hooks, so pools and setup files they add count.
  - The memory plan caps automatic workers at four.
  - `hotRuntime: true` requires the hot runtime and fails at startup when it cannot be bounded, including on a Vitest version mismatch.

- 2581950: **An experimental `metroConfig` option reads the project's Metro resolution profile: source and asset extensions and their order.** Set `reactNative({ metroConfig: true })` to try it; the default is `false`.

  - The Metro config, or Expo's defaults, is evaluated in a short-lived, memory-bounded child process. `metroConfig: { configFile }` points at a config outside the project root.
  - Main fields and conditions are reported under `diagnostics`. A custom `resolver.resolveRequest` does not run under Vitest; one warning names the gap.

### Patch Changes

- c3832c2: **`vitest-native migrate --write` no longer ends with "Re-run with --write".** Once the config is saved, the closing line names the next step instead: `✓ wrote vitest.config.mts from the analysis above. Next: npx vitest-native doctor && npx vitest`. Without `--write`, the report still ends with how to save the config. No action needed.

- 5f991ed: **Native engine: a workspace library reached through a regular-expression `resolve.alias` now has its React Native dependencies compiled, as one reached through a string alias does.** Tests that failed with `Cannot find module '…/expo-asset/build/Asset.fx'` now run. No action needed.

  - Also applies to an alias with a `customResolver`.
  - A replacement counts up to its first substitution (`$1`, `$<name>`), so `/repo/packages/ui/src/$1` reaches the library, while `/repo/packages/$1` still needs it declared as a dependency.
  - Not covered: `test.alias`, and aliases other plugins resolve, such as `vite-tsconfig-paths`.

- c1b556d: **The published package now holds one copy of each runtime module, and `vitest-native doctor` reads its supported Node range from the installed manifest.** The plugin entry imports the shipped runtime files instead of bundling a second copy of them. No action needed.

- ddaaf2d: **Under the hot runtime, the startup log now names the worker count on every run, and what chose it.** It reads `[vitest-native] workers: 4 (automatic cap of 4; 9 available, set maxWorkers to run more; 24576 MiB host memory)`, so tuning `maxWorkers` or reporting a run no longer needs diagnostics on. No action needed.

- 933b43e: **Under the native engine, a broken install of Babel's thread now fails the first compile at once, naming the file it could not load.** Before, a missing `babel-worker.mjs`, or one that failed as it loaded, left each compile waiting the full deadline (a minute or more) before a generic "has not answered" error. Each request to Babel's thread now also carries an id, and only the answer with that id ends its wait, so an answer that arrives late can never be read as the next one's. No action needed.

- 1bddfde: **Native engine: `@vitest/coverage-v8` now reports the files Node compiles, such as a React Native workspace package, mapped to their source lines.** Before, it printed "Failed to parse … Excluding it from coverage" for each one and left it out of the report. No action needed.

  - With `provider: 'v8'`, the plugin sets Vitest up to use `@vitest/coverage-v8` with one change: it reads those files from the engine's transform cache. While coverage is on, that cache keeps an inline source map for each file outside `node_modules`. The report still says "v8".
  - Files outside the project root still need `coverage.allowExternal`. See the new Coverage guide page.

- 6ace1b5: **Native engine: a deep import of a preset package, such as `react-native-reanimated/src/common/style/propsBuilder`, now loads that real file.** It used to get the package's whole root mock, so its named exports were `undefined`. Change a deep import that relied on getting the root mock to import from the package root.

  - As under Jest, where `jest.mock(pkg)` leaves a package's subpaths alone. The mock engine is unchanged.
  - Still the mock: a subpath whose last segment the mock exports (`react-native-gesture-handler/Swipeable`), and one that resolves to the package's own entry (`react-native-safe-area-context/src`).
  - Not covered: objects a real deep file creates, such as a context, are not the hand-written mock's.

- 6ace1b5: **The `safeAreaContext` preset's own mock reads its contexts in `useSafeAreaInsets` and `useSafeAreaFrame`, as the library's Jest mock does.** A test's `SafeAreaInsetsContext.Provider` value and `SafeAreaProvider`'s `initialMetrics` now reach components, and `setInsets()` still sets the default. Change a test that calls these hooks directly to call them inside a component or `renderHook`.

- f6d7a75: **`hotRuntime`: a test that times out inside `act()` no longer fails every later file on its worker.** Those files failed with `Unable to find an element with text: …`. The worker is now replaced after that file, and the timed-out test names the open `act()` scope. No action needed.

  - With one worker the worker cannot be replaced: the next file waits up to `testTimeout` for the scope to close, then the remaining files fail naming the cause.

  Thanks @sincraianul for reporting this (#449).

- abe8983: **Native engine, `hotRuntime`: a hot worker's memory no longer grows by a copy of every CommonJS package a test file imports.** Each file's copy stayed alive for the rest of the run, so a suite whose files import large packages hit `memoryLimit` and recycled workers every few files. No action needed.

  - From its second file on, a package is collected once no file uses it. What stays per file is a few kilobytes per imported package.
  - Packages that ship as ES modules and run in Node unchanged still keep one copy per file.
  - Requires Node 22.22.3+, 24.12+ or 26. Older Node versions behave as before.

  Thanks @sincraianul for reporting this (#448).

- 6defadb: **Native engine: a file loaded by Node, such as a React Native workspace library reached through an alias, can now use `import.meta.url`, `import.meta.filename` and `import.meta.dirname`.** Tests that failed with `Cannot use 'import.meta' outside a module` now run. No action needed.

  - The three properties get the values Node gives the file, as `babel-plugin-transform-import-meta` gives them under Jest. Expo projects keep `babel-preset-expo`'s own `import.meta` handling, as under `jest-expo`.
  - Any other property, such as `import.meta.env`, fails with an error naming it and the file. Add the package to `transform: { exclude: [...] }` so Vite loads it.

- ad7fb3e: **Under the native engine, compiling a file no longer fails at random with "Babel's thread has not answered in 60 s" on a busy machine.** Babel's thread wakes the caller after it stores each answer. If that wake-up was delayed past the caller's next request, it ended the wait for that request before Babel had answered. The file then failed at once, however small it was and well short of the deadline. The caller now waits until the answer itself is there. No action needed.

- 2b3a577: **Under the native engine, a test that loads `expo-modules-core` or `expo` from an unsupported Expo SDK now gets a warning naming the version and path.** A library using an older SDK's Expo modules without `expo` of its own failed inside `expo-modules-core` with no hint why.

  Upgrade to Expo SDK 57 or 58 if the warning names a package your tests use. It appears with the first test in each file that loads the copy. The project-root check no longer counts an optional `expo` peer. See [Expo SDK support](https://danfry1.github.io/vitest-native/guide/expo#sdk-and-react-native-versions).

- d42f62a: **Under the native engine, `uuid.v5()` from expo-modules-core returns a name-based UUID and `installOnUIRuntime()` no longer throws.** `uuid.v5()` matches a device's result for a valid namespace and rejects an invalid one with the device's error. `LegacyEventEmitter` given an Expo module returns the module itself, as on a device. The runtime's remaining keys now exist, with jest-expo's values. No action needed.

- b9c9c5d: **Native engine, `hotRuntime`: a workspace library loaded by Node, whether a detected React Native library or one named in `transform`, is now evaluated again for each test file.** It kept the first file's instances, so later files read stale state and `instanceof` failed. No action needed.

- 3510819: **The `safeAreaContext` preset serves react-native-safe-area-context 5.11's `SafeAreaCornerAdaptedInsetsContext`.** Importing it from a test using the preset gave `undefined`. `useSafeAreaInsets({ cornerAdaptation })` now answers the preset's regular insets, as the library's own Jest mock does when no provider sets corner-adapted insets. No action needed.

- 74f1bf0: **Native engine: a setup file inside a workspace library that declares `react-native` runs.** Listing it in `test.setupFiles` stopped the run with `MODULE_OWNER_CONFLICT` (`Vite attempted to transform '…/vitest.setup.ts', but the native ownership policy assigns that file to Node`). No action needed.

  - The setup file runs in Vite, as test files do. The library files it imports are still loaded by Node, so a `vi.mock` in the setup file does not reach their imports.
  - Not covered: a library file that imports `vitest`. Add the library to `transform.exclude`.

- dff0230: **Under the native engine, `globalThis.expo.SharedObject` has `release()`.** expo-modules-core's `useReleasingSharedObject` hooks, which expo-video, expo-audio and expo-image build on, call it from their effect cleanup, so every unmount of such a component threw `TypeError: object?.release is not a function`. React reports an error in a cleanup through `console.error` instead of rethrowing, and Vitest 5 hides the console output of passing tests, so this showed only with `silent: false`. The stand-in now has the no-op `release()` the native class has; `SharedRef` and the fabricated native classes inherit it. No action needed.

  Thanks @swey for the fix (#417).

- 858e0c7: **Native engine: Expo's runtime globals are installed only when the project declares `expo` or a package that depends on it.** Before, a package where `expo` merely resolved, such as one in a hoisted workspace, failed every test file in setup with `'expo' shipped source Node can't run directly` or `Cannot find module '…/expo/build/winter/runtime'` on SDK 58.

  - A manifest above the project, or a `transform` entry naming `expo`, also counts; `presets: { expo: true }` alone does not.
  - Such a project no longer gets Expo's globals (`structuredClone`, `URL`, …), as under jest-expo. Declare `expo` or add it to `transform` if the project relies on them.

- 53bc6fb: **Native engine: config loads are faster on projects with many React Native packages.** No action needed.

  - Each package's directory is resolved once per config load. On a large Expo app this cuts config-time resolutions from about 2,100 to about 1,100, roughly 14 ms per load, for each project in a multi-project config.
  - Which packages are detected, and whether Vite or Node loads each file, is unchanged. A package installed during a watch session is still picked up when Vitest reloads the config.

- 64ac383: **Native engine: a package that depends on a workspace library now compiles that library's React Native dependencies, such as `expo-asset`.** Tests that failed with `Cannot find module '…/expo-asset/build/Asset.fx'` now run. No action needed.

  - Also applies to a library reached through a string `resolve.alias` or tsconfig `paths` without being declared.
  - More installed packages are now loaded by Node, so a `vi.mock` from a test does not reach their imports.
  - Not covered: regular-expression aliases, aliases other plugins add, and a `setupFiles` entry inside an undeclared library. Declare the library as a dependency instead.

- 1ce2f5d: **Native engine: `NativeModules.EXDevLauncher` is absent in every mode, as in Expo Go, so `expo` and `expo-constants` import with `nativeModules: 'permissive'`.** There they threw `Unexpected token '(', "(...args) "... is not valid JSON`. No action needed.

  - Only expo-dev-launcher registers the module, in a development build. It is also absent from `TurboModuleRegistry.get` and `globalThis.expo.modules`, and `TurboModuleRegistry.getEnforcing('EXDevLauncher')` throws React Native's "could not be found" error.
  - To model a development build, register it with `mockNativeModule('EXDevLauncher', …)`.

- c4f31b0: **Native engine: a cache miss no longer fails with `Cannot read properties of undefined (reading 'environmentVisitor')`.** It hit Expo SDK 57 projects on a warm transform cache, naming whichever file missed. No action needed: Babel now runs on its own thread, as under Jest.

  - A Babel config or plugin sees the Babel worker's `process.argv`, `isMainThread` is `false`, and the tests' `require.cache` and globals are not visible. `process.env` is shared.
  - If Babel's thread is lost, the file fails with `TRANSFORM_FAILED`: at once when something exits it, such as `process.exit()` in a config, or after 60 s plus 15 s per MB of source when it runs out of heap. A slower transform fails the same way.

- 43139a6: **Native engine: the dependencies of every package a run reaches are compiled, including one only another workspace member declares and one named in `transform: [...]`.** Remove `transform` entries added only to work around this.

  - A library declaring `expo-image` failed with `Cannot find module 'expo-asset/build/Asset.fx'`, and `react-native-flash-message` left `react-native-iphone-screen-helper` uncompiled, so its `Platform` was `undefined`.
  - If a newly compiled dependency is in `test.server.deps.inline`, startup stops with `INLINE_BREAKS_OWNERSHIP`. Remove it from there.
  - Peer dependencies are followed only into packages already detected. A package an active preset shadows, or that `transform.exclude` names, is not followed.

- 1d3fd76: **A project whose root reaches Vitest under another spelling of the same directory no longer fails with "the project context is invalid".** No action needed. On Windows one directory has more than one spelling (`C:\Users\RUNNER~1` and `C:\Users\runneradmin`), and a symlinked root is another; the check that each project runs with its own context compared the two as strings. It now compares the directories they name.

- 5da25bf: **`vitest-native doctor` notes that Vitest 4 runs without the transform cache.** On Vitest 4 the
  plugin leaves Vitest's persistent transform cache off, so every run transforms every imported
  module again (about half a second per thousand modules on one benchmark). doctor now says so in a
  "Transform cache" section that never fails the check. To get the cache, upgrade to Vitest 5, or
  from Vitest 4.0.11 set `test.experimental.fsModuleCache: true` after reading the troubleshooting
  entry on [vitest-dev/vitest#11789](https://github.com/vitest-dev/vitest/issues/11789) (reproduced
  on 5.0.5, unverified on 4). doctor also flags a top-level `test.fsModuleCache`, which does nothing on 4.

- 4bda491: **Native engine: a default import of tslib, or any CommonJS that sets `__esModule` without a `default`, from a compiled ES module is `module.exports`, as under Node.** It was `undefined` (`Cannot read properties of undefined (reading '__extends')`). No action needed.

  - Applies to `.mjs` and `"type": "module"` files compiled without a project Babel config, including `export { default } from` and `import * as ns`. A target with its own `default` gives that, as Metro does.
  - `import * as ns` of such a target is a separate object, so `typeof ns` is `"object"` and `vi.spyOn(ns, name)` no longer replaces the module's own member.
  - In an import cycle, a default read while the target loads is `module.exports`, not `undefined`.

- 5bd3352: **Every extension Metro resolves as an asset by default is an asset in tests too, so expo-router's Android toolbar loads.** No action needed. The default asset extensions now include all of Metro's (`xml`, `pdf`, `html`, `yaml`, `yml`, `zip`, `psd`, `m4v`, `mpeg`, `mpg`, `aiff`, `caf` were missing), plus the image and font types vitest-native already added. A `require('./icon.xml')`, which expo-router's Android toolbar makes for its vector drawables, failed with `SyntaxError: Unexpected token '<'` because the file was compiled as JavaScript; it now registers as an asset, as in an app built with Metro.

- c50112c: **Mock engine: `StyleSheet.compose` and `StyleSheet.flatten` match React Native for missing and empty styles.** Update affected snapshots with `vitest -u`.

  - `compose(null, b)` returns `b` and `compose(a, undefined)` returns `a`, not a two-element array.
  - `flatten([])` and `flatten([null, false])` return `{}`, and `flatten` of a number or string returns `undefined`.

- 30cdad9: **The native engine now detects and compiles an installed React Native package whose `exports` map leaves out `./package.json`.** Before, such a package was silently skipped. On Node versions that run the loader hooks off-thread (22.13–22.22.2, 24.0–24.11), Node then ran its ES module build as published and failed on its extensionless imports. Expo SDK 57's `expo-symbols` is one: on Android, expo-router requires it, and the run failed with `Cannot find module '…/expo-symbols/build/materialImageSource'`. No action needed. If you listed such a package in `transform: [...]` to work around this, the entry can go. The same lookup now serves the `react-native`-field alignment between Vite and Node.

- 5f819d6: **With `jestMockTransform()`, a partial mock of your own source (`jest.mock(p, () => ({ ...jest.requireActual(p), x: jest.fn() }))`) shares module state with the rest of the file.** No action needed.

  - `jest.requireActual` in the factory loaded a second copy through Node, whose real members read state the app never wrote. It now loads through Vite, by relative path, string alias, `resolve.tsconfigPaths` or a regex `resolve.alias`, which failed with `REQUIRE_ACTUAL_ALIAS_UNSUPPORTED`.
  - Under the native engine, project source loads through Vite even when `server.deps.external` names it; a module the engine runs in Node keeps the Node load.
  - Not covered: a `require()` or `jest.requireMock` before any import, or a `jest.requireActual` inside a returned function, still loads a separate copy.

- 97615f3: **Native engine: React Native's own modules run with the strict-mode semantics they have under Node and Jest.** No action needed; React Native's precompiled modules rebuild once on the first run.

  - Most React Native modules are not strict, but ran strict: a write to a frozen object threw a `TypeError` where Jest fails silently, and `this` in a plain call was `undefined`.
  - Each module keeps its own directive and runs with `this` set to `module.exports`, as in Node's CommonJS wrapper. The hot runtime is covered too; `VITEST_NATIVE_NO_REGISTRY=1` already behaved this way.

- 88bf375: **Native engine: stack frames inside React Native name the real file, such as `react-native/Libraries/vendor/emitter/EventEmitter.js:1:735`, instead of `rn-ios-<hash>.cjs:798:744`.** No action needed; React Native's precompiled modules rebuild once on the first run.

  - Line and column refer to the module as compiled.
  - A dynamic `import()` in a precompiled React Native module resolves from its own file instead of failing with `ERR_MODULE_NOT_FOUND`; no module in React Native 0.86–0.88 does this today.
  - Workers no longer turn on Node's source-map support for these modules, and no `.map` file is written beside them.

- be69e50: **Extensionless imports into large directories resolve faster, under both engines.** No action needed. Resolving `./Foo` across Metro's candidates (`.ios.js`, `.native.js`, `.js`, …) and its exact-case check now reads each directory once. A test importing 2000 modules from one flat directory went from about 4.2 s to 2.1 s; nested layouts gain a few percent. Results are unchanged, except in a directory that is readable but not searchable, where loading the file fails with `EACCES` either way.

- cfbe247: **A smaller install: the package is about 30% smaller (385 KB packed, down from 551 KB).** No action needed. The package no longer ships CommonJS builds that no entry point can reach: the CLI's (`bin` runs `cli.mjs`) and the chunks used only by the root, `setup` and `presets` entries, which already resolve `require()` to their `.mjs` builds. Every entry in `exports` resolves as before, and the `.mjs` files are unchanged. `CHANGELOG.md` and an internal design note are no longer in the package. The changelog is [on GitHub](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/CHANGELOG.md), and the migration, versioning and release-readiness guides still ship under `docs/`.

- 31d42fb: **An Expo SDK outside 57–58 gets a warning that names the supported SDKs.** On SDK 54, every Expo view threw `Cannot read properties of undefined (reading 'viewManagersMetadata')` with nothing naming the cause. Upgrade to Expo SDK 57 or 58.

  - The plugin warns once at startup, and `vitest-native doctor` in its Expo section, with the installed `expo` version. The run still starts.
  - The `expo` checked is the one the project resolves, directly or as the peer of a package it declares, so a workspace package that uses no Expo package is not warned about another app's.

- 0ffc361: **Native engine: a copied checkout no longer fails with `more than one copy of React`.** No action needed: the copy builds its own precompiled React Native modules on its first run.

  - A copy that included `node_modules/.cache/vitest-native` loaded React Native from the original checkout until the cache was deleted.
  - The same fix covers a `react-native` that starts resolving to a different installed copy, such as a workspace package that gains its own. A symlinked path to the same project keeps its cache.

- 7596cea: **`vitest-native init` and `vitest-native migrate` say how to turn on the hot runtime.** No action needed. Both commands now end with a short note: the hot runtime is off by default (`hotRuntime: false`), `hotRuntime: 'auto'` reuses workers between test files and can make large native-engine suites faster, and it has known differences from per-file isolation, linked to the troubleshooting guide. The generated config is unchanged.

- 8319b1f: **React Native Testing Library's automatic cleanup runs without `test.globals: true`** (RNTL 12–14, both engines, the hot runtime and `isolate: false`). Set `RNTL_SKIP_AUTO_CLEANUP` or import `@testing-library/react-native/pure` if a suite relied on trees staying mounted between tests.

  - RNTL registers cleanup only when `afterEach` is a global, so trees stayed mounted for the rest of the file. The setup registers it through Vitest, also for RNTL re-exported by shared test-utils, after the file's own `afterEach` hooks (Jest runs it first).
  - With `isolate: false`, fake timers left on by an earlier file no longer make the cleanup time out.
  - Mock engine with `test.globals: true`: a file importing `/pure` is no longer cleaned up, as RNTL documents.

- b5f40d5: **Under the hot runtime, Node's compile cache no longer grows with every test file.** No action needed; to keep the cache on, set `hotRuntime: { esmGeneration: false }`.

  - Each file re-evaluates the ES modules it imports under a new URL, so the cache gained an entry per module per file: about 18,500 entries (147 MB) in one case, written at exit and sometimes ending in `Timeout terminating`.
  - Hot workers now leave the cache off, costing about 15–20 ms per worker boot. Per-file isolation keeps it on.
  - Not covered: with `NODE_COMPILE_CACHE` set, Node turns the cache on first; unset it for hot runs. To reclaim space, delete `node_modules/.cache/vitest-native/v8`.

- 838b1a8: **Under the native engine with RNTL 12 or 13, `getByText` finds a nested `<Text>` by its own text**, as it already did with RNTL 14. No action needed. The mock engine is unaffected.

  Real React Native renders a nested `<Text>` as the host `RCTVirtualText`, which RNTL 12 and 13 do not treat as text, so `getByText` matched only the outer text. The native setup now extends their `isHostText` check with it, as it already extended RNTL 14's list of text hosts.

  Not covered: role queries on RNTL 12. A nested `<Text accessibilityRole="link">` is still not found by `getByRole("link")` there; RNTL 13 and 14 find it.

- 838b1a8: **The react-native-screens preset renders a native-stack screen's header**, so `headerLeft`, `headerRight` and a custom title can be queried. Both engines. No action needed, but a test asserting that a hidden header's buttons are absent must now expect them.

  native-stack hands those elements to `ScreenStackItem` as `headerConfig.children`, and the preset's `ScreenStackItem` rendered only the screen's content, so back buttons and header actions were missing (for example with `presets: { navigation: false }`, where the real native-stack runs). It now renders `ScreenStackHeaderConfig` with `headerConfig` after the content, as react-native-screens does, and no longer passes `headerConfig` as a host prop. As in react-native-screens, the header config and its children are rendered even with `headerShown: false`.

- cd55d7b: **RNTL's `findBy*`, `waitFor` and `userEvent` advance `vi.useFakeTimers()` without jest-compat** (native engine, with or without the hot runtime, RNTL 12–14). Drop any `vi.advanceTimersByTime` added before a query as a workaround.

  - A setup file that calls `vi.useFakeTimers()` no longer hangs RNTL's auto-cleanup: RNTL captures the real `setImmediate`, as under Jest.
  - RNTL's own files get a `jest` with five timer calls backed by `vi`; `globalThis.jest` stays undefined. A `setTimeout` replaced with `vi.spyOn` counts as fake timers, as in Jest.
  - Loading RNTL with fake timers on reinstalls them from the `fakeTimers` config, dropping per-call options, system time and pending timers; under the hot runtime only in the first file. The mock engine is unchanged.

- f312a7e: **The startup banner names the presets a run applies**, for example `mocked: navigation, safeAreaContext, screens (platform ios)`. No action needed.

  - Each preset replaces its whole library, so an app rendering its real navigator under the navigation preset got a `NavigationContainer` that never calls `onReady`. Turn it off with `presets: { navigation: false }`, plus `screens: false` for a native-stack header.
  - A project's own preset modules are named as the config writes them. In a multi-project run the banner prints once, for the first project.

- f312a7e: **Native engine: under an isolated install (pnpm, or bun's isolated linker), the transitive dependencies of React Native packages are compiled.** No action needed; hoisted layouts are unaffected.

  - Each dependency was looked up from the project root, where an isolated install links only direct dependencies. With `presets: { navigation: false }`, `@react-navigation/elements` failed with `The requested module '@react-navigation/native' does not provide an export named 'useTheme'`.
  - Dependencies now resolve from the package that declares them, as Node resolves them. The build toolchain (Metro, `@babel/runtime`, `babel-preset-expo`, `@expo/metro`) stays out of the transform.

- d425b0e: **`vitest-native/jest-compat`: two errors that differ only in per-instance methods are equal, so identical zod 3 `ZodError`s match.** No action needed.

  - `toEqual`, `rejects.toEqual` and `toThrow(error)` failed with `Compared values have no visual difference` where Jest passes. An own property that is a function on both errors is now ignored.
  - Everything else compares as before: name, message, `cause`, `AggregateError`'s `errors`, other own properties and `toStrictEqual`'s type check.
  - The `expect` is shared, so Vitest-style assertions in the same project compare the same way.

- 5fc9188: **Under the native engine, `process.env.EXPO_OS` is the test platform (`ios` or `android`) in a project that resolves `expo`.** No action needed. A value already set in the environment or `test.env` is kept, and `vi.stubEnv("EXPO_OS", …)` overrides it per test.

  babel-preset-expo inlines `EXPO_OS` as it compiles, but the engine compiles `node_modules` with React Native's Babel preset, so Expo's packages read the variable at runtime and found it unset: expo-modules-core warned that it "should be inlined by babel-preset-expo", its `Platform.select` returned `undefined`, and expo-router took its non-iOS branches on iOS. The hot runtime keeps the value between test files. The mock engine does not set it.

- 5fc9188: **With RNTL 12 or 13 (React 19's `react-test-renderer`), a recoverable React error is logged with `console.error` instead of failing the run.** Both engines. No action needed.

  - When a component threw once in a concurrent render and React recovered, Vitest exited 1 with an unhandled error while every test passed. Any other renderer error, such as an uncaught render error outside `act()`, still fails the run.
  - `globalThis.reportError` exists only while the renderer loads. The handler is found by React's function name; a test pinned to the installed renderer catches a rename.
  - On Node 26, an uncaught render error is reported as itself, not `TypeError: window.dispatchEvent is not a function`.

- 1111062: **`vitest-native/jest-compat`: `jest.useFakeTimers(options)` honours Jest's options.** Pass `now` to `jest.useFakeTimers()` if a suite relied on a `setSystemTime` date carrying into the next test.

  - `advanceTimers`, `doNotFake`, `now` and `timerLimit` (default 100,000) translate as in Jest 30; each call starts at the real time unless given `now`. `legacyFakeTimers: true` fakes only timer functions, leaves `Date` real, and warns once. Both calls return `jest`; `process.nextTick` and `queueMicrotask` stay real.
  - Options set at the top of a setup file are lost once RNTL loads; call `jest.useFakeTimers()` in a `beforeEach`, or use `test.fakeTimers`.
  - The [migration guide](https://danfry1.github.io/vitest-native/migration/from-jest) explains keeping Jest's and Vitest's `.snap` files apart with `resolveSnapshotPath`.

- 3e6428a: **On Vitest 4 with `hotRuntime` on, a test file no longer receives an earlier file's `vi.mock` factory.** No action needed.

  Before, when one file mocked a module with a factory and a later file in the same worker mocked it any other way (an automock with `vi.mock(path)`), the later file got the earlier factory's result, and calls such as `mockReturnValue` failed with `is not a function`. Each file now fetches such a module again under its own mocks. The same holds inside one file: a factoryless `vi.doMock` after `jest.resetModules()`, or inside `jest.isolateModules`, now gets an automock. Vitest 5 and the default per-file isolation were not affected.

- a5592d2: **Native engine: an ES-module project file that a test imports and a project module `require`s is one module, with or without jest-compat, as under Jest.** No action needed.

  - `vi.spyOn` on a required module and assignments to its exports reach importers, `instanceof` holds across both, and a partial `vi.mock` with `importOriginal` gives `require(path)` the module Vite evaluated.
  - A suite that deleted a `require.cache` entry to get a fresh copy of an imported file now gets the imported one.
  - Not covered: a project file required before it is imported, or a `.cjs` file Vite evaluated, still loads twice.

- 95a6466: **On Node 26, a library loaded again in each test file is no longer resolved again each time.** No action needed. Node 26 passes a plain `require` the options `{ paths: undefined, conditions }`. The resolution memo treated the unset `paths` as a `require.resolve` with `paths` and left every such request to Node, so it saved nothing on Node 26. An unset option is now ignored; a `require.resolve` with `paths` set is still left to Node.

- 36e7de0: **Vite+ projects start, and two copies of Vitest fail by name.** Versions are read from the running Vite and Vitest, not the packages found from the project root. No action needed for an ordinary install.

  - Under Vite+, runs no longer stop with `UNSUPPORTED_PEER` (`requires vite >= 6.4.2 … found 1.3.0`), nor fail with `vitest … was not found` when pnpm gets `vitest` only through Vite+. `init` writes a Vite+ config; `migrate` suggests one.
  - A different physical copy of Vitest stops the run with `VITEST_TWIN_INSTANCE`, naming both paths. Install one Vitest both resolve. The hot runtime refuses such a project; `hotRuntime: false` also works.
  - Vitest 2 and 3 still fail with `UNSUPPORTED_PEER`.

  Thanks @eshvatskyi for reporting this (#354).

- 432b86c: **Workers read their configuration from one validated project context file, and fail with `CONTEXT_INVALID` when it is missing, stale or malformed.** Set the matching `reactNative()` option (such as `platform`) and remove the variable if the plugin warns that a `VITEST_NATIVE_*` variable is no longer read.

  - About twenty `VITEST_NATIVE_*` environment variables carried it before, and a bad value silently became a default. They no longer reach workers.
  - The file is rewritten if the cache is cleared during a watch session, and falls back to the system temp directory when the cache cannot be written. Test results are unchanged.

- 1e7ae98: **A library a worker loads again in each test file, such as a library run as itself or its own Jest mock, is no longer re-resolved and re-read every time.** No action needed.

  - Resolutions of bare and extensionless relative requests are kept per requiring directory for the worker's life. A kept resolution whose file was removed is resolved again; a nearer copy installed mid-run is seen after the worker restarts, as with Node.
  - A source whose compiled output is held for its current size and modification time is not read again, so a file edited between test files is still recompiled.

- ff23fde: **The hot runtime no longer drops test files from a run.** No action needed.

  - A file that `jest.mock`ed a module the per-file reset restores through Node, such as `jest.mock('react-native/Libraries/Utilities/Appearance', () => null)`, made the next file's reset throw before collection, so that file was missing from every reporter. On react-native-paper this dropped one file per run with four workers, and 19 of 52 with one.
  - A reset that fails now fails its file with the error. A file whose worker's task broke is reported as failed by name, and the run fails.

- cbade8c: **Native engine: the ESM loader hooks run in-thread (`module.registerHooks`) on Node 22.22.3 and later, 24.12 and later, and 26.** Other versions use the threaded `module.register`. To force the threaded loader anywhere, set `VITEST_NATIVE_LOADER_THREAD=1`.

  - In-thread hooks remove a cross-thread wait on every resolve and load of an externalized module: 18% of worker CPU on a 104-file production Expo suite.
  - On earlier releases that have `registerHooks`, expo-router failed with `request for 'node:module' is from a module not been linked` (through 22.22.2 and 24.11), and the hot runtime's module reset misbehaved.

- 0c45e87: **Native engine on Node 22.15–22.18 and early Node 24 (24.3 and 24.4 measured): `require()` is no longer read as an `import`.** Every test failed with `Reentrant preset detected`. No action needed.

  - On those versions a `require()` reports its conditions to in-thread hooks as an empty object, so Babel's own files were compiled as Babel loaded them. The bug occurred only with in-thread hooks, and those versions now use the threaded loader.
  - Node 22.19 and 24.6 onwards were unaffected.

- ce3be7a: **Native engine: a test that imports `expo` or `expo-router` from Expo SDK 58 (React Native 0.88) no longer hangs.** No action needed.

  - Expo's runtime requires `react-native/setup-env`, which replaced Node's timers with React Native's native-driven ones, so the first awaited timer never fired. That entry is now skipped, as `InitializeCore` already was.
  - The `expo-linking` preset adds `getLinkingURL`, `openURL` and `unwrapDevLaunchURL`, which expo-router 58 calls while rendering a route tree.

  Thanks @AntSplash360 for reporting this (#296).

- 2ede5df: **Native engine: in an Expo project, Expo's runtime globals (`URL`, `structuredClone`, `DOMException` …) are installed before your setup files, in every test file, as jest-expo does.** No action needed.

  - A `fetch` mocked in a setup file is no longer replaced when a test imports Expo. Global `fetch` stays Node's, so MSW, nock and undici's `MockAgent` keep intercepting where Expo's `fetch` failed with `request.start is not a function`.
  - Node's `FormData` keeps working after Expo loads, where `append()` and `set()` threw. See the [Expo guide](https://danfry1.github.io/vitest-native/guide/expo).

- 2ac4de3: **Native engine: an Expo project without `@react-native/babel-preset` runs real React Native, compiled with Expo's preset (`expo/internal/babel-preset`) as Expo's Metro and jest-expo do.** No action needed.

  - From SDK 56, `babel-preset-expo` no longer depends on `@react-native/babel-preset`, so a project from the SDK 56, 57 or 58 template has none, and `reactNative()` fell back to the mock engine, where Expo modules failed to load. A project that has it keeps using it.

- 306b27a: **Native engine: `expo-image` can be imported.** It failed with `Cannot read properties of undefined (reading 'expo-image')`. No action needed.

  - `globalThis.expo.modules` answered every name, so `requireOptionalNativeModule` found expo-observe's `ExpoObserve` instead of taking its fallback. A module an installed package only probes for, and that no installed or local Expo module defines in its native sources, now reads as absent, as on a device.
  - Every other module stays present. The scan is cached until the install changes.

- 61ae436: **Preset mocks keep their behaviour through `vi.resetAllMocks()` and `mockReset: true`.** No action needed.

  - A gesture-handler gesture built before a reset, such as `Gesture.Pan()` at module scope, keeps chaining, and so do reanimated's builders: `LinearTransition.springify().damping(20)` and `SharedTransition.duration(300).custom(...)` no longer throw.
  - Mock engine: `Platform.select()` follows `Platform.OS` after a reset, so a setup file's `setPlatform('android')` holds.
  - `Platform.select()` picks by key presence, as React Native does, so an explicit `ios: undefined` selects `undefined`.

  Thanks @Joozty for reporting this and the first fix (#278, #279).

- df06716: **Native engine: an imported BMP image's `width` and `height` are read as Metro 0.87.1 reads them.** An OS/2 bitmap (12-byte header) gets its real dimensions instead of a misread width, and a file whose header size is not a bitmap's registers without dimensions. No action needed.

- dc2543b: **`migrate` writes Jest's mock-clearing behaviour correctly.** Rename `test.resetMocks` to `test.mockReset` in a config an earlier `migrate` wrote, and add `clearMocks: false` if the Jest config did not set `clearMocks`.

  - Jest's `resetMocks` becomes `test.mockReset`, Vitest's name for it. It was written as `test.resetMocks`, which Vitest ignores.
  - When the Jest config does not set `clearMocks`, the generated config sets `clearMocks: false`, Jest's default. Vitest 5 defaults it to `true`, which clears calls mocks received while modules loaded.

- b10cce3: **`migrate` no longer says the test script's flags were "mapped above" when the script has no flags.** No action needed.

- 3d20592: **Native engine: a file reached through a symlink, or on Windows through an alias target written with `/`, loads once instead of as two instances of one module.** No action needed. Modules the require hooks resolve themselves (Metro's platform-extension scan, the project's aliases, React Native's deep paths) are keyed by real path, as Node keys its own.

- 041fd77: **Native engine: setup order, `expo` imports, `#/` aliases, `export * as ns`, Nitro modules and mmkv 3 work as in a production Expo app's suite under Jest.** No action needed.

  - React Native's setup runs before the project's setup files, so one importing `react-native` or `@testing-library/react-native` no longer fails on Flow source without the hot runtime. Importing `expo`, directly or through `expo-location` and others, works.
  - `require('#/…')` and `jest.requireActual('#/…')` resolve `resolve.alias` and, when Vite resolves them, tsconfig `paths`. App source required through Node compiles `export * as ns from '…'` when the project's Babel plugin is present.
  - `react-native-nitro-modules` imports; creating a hybrid object throws `NITRO_HYBRID_OBJECT_UNAVAILABLE`. `react-native-mmkv` 3+ runs its own test mode; the `mmkv` preset applies to mmkv 2 only.

- dbb9c74: **jest-compat matches Jest for factory getters, left-out exports, `new` on a `jest.fn`, and `JEST_WORKER_ID`.** No action needed.

  - Getters in a `jest.mock` factory are read on each access, so `() => ({ get IS_WEB() { return mockIsWeb } })` no longer throws `Cannot access 'mockIsWeb' before initialization`.
  - An export a `jestMockTransform` factory leaves out is `undefined`, not `No "x" export is defined on the "m" mock`; a plain `vi.mock` keeps Vitest's check.
  - `new` on a `jest.fn` or `jest.spyOn` mock with an arrow implementation returns its result instead of throwing `… is not a constructor`; `vi.fn` is unchanged. `process.env.JEST_WORKER_ID` is set from `VITEST_POOL_ID` when unset.

- 52e80aa: **Under the hot runtime, externalized imports are no longer re-resolved from scratch for every test file.** No action needed. The loader keeps successful resolutions per parent module, so Node stops re-reading `package.json` scopes to decide module formats on every file.

- 6100732: **`migrate` reproduces Jest's test set and settings, and sorts Babel plugins.** Run `vitest-native migrate` again if it wrote your config, and compare its `include`/`exclude` with yours.

  - Patterns follow `testMatch`, the installed preset, or Jest's defaults; a jest-expo app had collected twice Jest's files. Ignore patterns become `test.exclude` globs; the script's `--testTimeout`, `--maxWorkers`, `--runInBand` and `--config` apply.
  - Anchored `moduleNameMapper` keys become exact aliases. `transform` gets only packages shipping JSX or Flow the engine does not compile.
  - Plugins are required, mapped, not needed or unknown; required ones are added through `@rolldown/plugin-babel` when Vite 8 and that package are installed, otherwise printed as a snippet. `doctor` warns about them. See [`migrate`](https://danfry1.github.io/vitest-native/guide/cli#migrate).

- 2233866: **An Expo project's first run no longer prints a circular-dependency warning.** Node printed `Accessing non-existent property 'then' of module exports inside circular dependency` on a cold cache, for example on a fresh `create-expo-app` project. No action needed. Code Babel loads during a transform, such as `hermes-parser` and `babel-plugin-syntax-hermes-parser`, now runs as published, as under Jest, instead of going back through Babel.

- 84591de: **The `flow-remove-types` dependency is now ^2.333.0 (was ^2.332.0).** No action needed.

- bb9cf45: **`./App` no longer resolves to `app.json` on macOS and Windows, so the React Native CLI template's own test passes.** It failed with `Element type is invalid … got: object`. No action needed. Metro tries `.json` before `.tsx`, and those disks are case-insensitive; extensionless relative imports now match file names exactly under both engines, as Metro's case-sensitive file map does.

- e2fa36e: **Expo projects resolve tsconfig `paths`, as Expo's Metro does, so the SDK 57 template's `@/…` imports work.** They failed with `Cannot find package '@/components/…'`. No action needed.

  - In an Expo project with a `tsconfig.json`, the plugin turns on Vite 8's `resolve.tsconfigPaths`. An explicit `resolve.tsconfigPaths`, or `experiments.tsconfigPaths: false` in `app.json`, takes precedence.
  - Vite 6 and 7 cannot resolve them; the plugin warns once with the remedy. Bare React Native projects are unchanged.

- d23ecfa: **The warning that a file calls `jest.mock()` without `jestMockTransform()` applies only to the project's own files.** It also fired for dependencies and vitest-native's own files, telling a project using `vitest-native/jest-compat/setup` to fix a file inside `node_modules/vitest-native`. No action needed.

- d93d80d: **Native engine: Expo packages whose TypeScript source has no type syntax load.** A test rendering the Expo SDK 57 template's `Collapsible` failed with `Stripping types is currently unsupported for files under node_modules`. No action needed. TypeScript files are now always compiled; `expo-modules-core/src/polyfill/index.ts`, a bare `// noop`, was handed to Node unchanged.

- 7f70965: **A multi-project config with a native project under the hot runtime no longer fails with `Projects … have different 'maxWorkers' but same 'sequence.groupOrder'`.** No action needed with `'auto'`; with `hotRuntime: true`, give the projects the same `maxWorkers`, or a distinct `test.sequence.groupOrder` each (which runs them one after another).

  - The hot memory plan caps workers at four while another project gets one fewer than the CPUs, so any machine with more than five cores failed.
  - `'auto'` now keeps Vitest's isolation and worker count for that project and says why. `hotRuntime: true` fails with `HOT_RUNTIME_OVERRIDDEN`.

- 0063f23: **`environment: 'jsdom'` starts its workers, with both engines and with or without the hot runtime; happy-dom works too.** Every worker failed with `Cannot find module …/lru-cache/dist/commonjs/react-native/index.min.js`. No action needed.

  - Vitest passes the `react-native` condition to workers, and lru-cache 11.5.3's export map names a `react-native` build it does not publish. When a package's `react-native` export target does not exist, the export now resolves with the process's other conditions; every other resolution is left as Node makes it.

- 49975e0: **`hotRuntime: 'auto'` keeps Vitest's own settings, including CLI flags.** No action needed.

  - An explicit `test.isolate`, `--isolate` or `--no-isolate` makes `'auto'` keep Vitest's semantics.
  - On Vitest 4, `vitest run --maxWorkers=1` failed with `HOT_MEMORY_UNBOUNDED` and did not exit, because flags reach the config after plugins run. The choice is now re-checked before any worker starts, per project, on both Vitest majors.
  - `hotRuntime: true` with a configured pool, `test.isolate` or a conflicting flag fails with `HOT_RUNTIME_OVERRIDDEN`, and `--pool=vmThreads` or `--pool=vmForks` with `UNSUPPORTED_POOL`. The banner names the hot runtime when in use.

- 49975e0: **Vitest 5: inline `test.projects` (`projects: [{ extends: true, … }]`) run with vitest-native's setup.** Their tests failed to load. No action needed.

  - Vitest 5 builds an inline project's `test` options before any plugin's `config` hook, so it lost the setup files, env and hot runtime the plugin adds. The plugin pins each inline project's `root`, so Vitest resolves it through the config file, as on Vitest 4; this also works in a nested config.
  - A project that still reaches the run without the plugin's setup fails with `SHARED_VITE_SERVER`.

- 49975e0: **React Native 0.87 loads in a project with no `node_modules` of its own, such as a monorepo package or a Vitest project rooted in a subdirectory.** It failed with `Cannot find module 'react-native/src/private/…'`. No action needed.

  - React Native's precompiled modules were cached in the OS temp directory and resolved React Native's deep imports from there. The cache now lives under the project's `node_modules`, or the nearest one above it containing React Native, and resolves from the project, so a temp-directory cache (read-only `node_modules`, macOS's symlinked `/var`) works too.

- 9ab8270: **The warning about project source that Node resolves without an extension, or by platform, is reported consistently.** It now says whether a duplicate is only possible or proven, and follows whether Vite or Node loads each file. Resolution warnings stay nonfatal. No action needed.

- 9ab8270: **The hot runtime is bounded by host or container memory, and fails with `HOT_MEMORY_BUDGET_EXCEEDED` instead of being killed for running out of memory.** To accept the risk on an externally bounded run, set `hotRuntime: { allowUnboundedMemory: true }`.

  - One plan for all workers comes from `os.totalmem()` and `process.constrainedMemory()`, reserves room for the main process and a replacement worker, caps automatic concurrency at four, and recycles one worker at a time on heap or RSS.
  - With `hotRuntime: true`, a run that batches every file into one task at one worker cannot be bounded and fails with `HOT_MEMORY_UNBOUNDED`; `'auto'` keeps per-file isolation.

- 9ab8270: **Native engine: on a cold cache, React Native's precompiled modules compile in a short-lived child process, so the long-lived Vite process stays small.** No action needed.

  - The child has a 96 MiB old-space cap, retried at 256 MiB only for a V8 heap out-of-memory. Warm runs start no process, and other failures fall back to loading per file.
  - The cache key includes the normalized asset extensions, which affect the emitted code.

- 290bc53: **`vitest-native doctor` reports Expo core and expo-router setups as covered.** It warned that they "can hit known limits" and linked a migration-guide section that no longer exists. It now links the [Expo guide](https://danfry1.github.io/vitest-native/guide/expo) and mentions `vitest-native migrate` for jest-expo projects. No action needed.

- ff77511: **Native engine: importing anything from `expo` no longer fails with `ErrorUtils is not defined`.** React Native's real `ErrorUtils` from `@react-native/js-polyfills` is installed once per realm, as `InitializeCore` does on a device. No action needed.

  - Expo's `Expo.fx` reads `ErrorUtils.getGlobalHandler()` at module scope.
  - expo-router's `expo-router/testing-library` (`renderRouter`, `testRouter.push`/`back`, `toHavePathname`, `useLocalSearchParams`) runs against the real React Navigation stack with `presets: { navigation: false }` and jest-compat, gated from a packed install.

- 9ab8270: **Hot runtime: ES-module imports of CommonJS re-exports keep their named exports across test files.** On affected Node versions they could silently get empty exports. No action needed.

  - The per-file cleanup also clears Node's stale relative-resolution lookups. It never evaluates user modules; incompatible loader behaviour fails with an actionable fallback to per-file isolation.

- e3faa95: **The hot runtime no longer leaks `jest.doMock`/`vi.doMock` or RNTL's hooks into the next file, and `jest.setMock` resolves relative paths from the test file.** No action needed.

  - A `doMock` issued after a file's last import was applied to the next file's imports; the per-file reset now clears Vitest's queue too.
  - RNTL, kept loaded per worker, registered its cleanup and act-environment hooks only in the first file, so `screen` could return the previous file's tree. Each file that imports RNTL now gets its hooks, and a file that does not gets none.
  - `jest.setMock` and `jest.dontMock` resolved relative paths against the jest-compat shim; they now resolve from the caller, as Jest does.

- 9ab8270: **Hot runtime: a setup file that installs fake timers no longer fails every file after the first with `Can't install fake timers twice`.** No action needed. The previous file's state (fake timers, stubbed globals and environment, listeners) is now reset at the file boundary, before any setup file runs.

- 01a9afc: **Native engine: importing `react-native` no longer prints every deprecation notice.** Importing only `Pressable` printed the notices for `SafeAreaView`, `Clipboard`, `PushNotificationIOS` and others. No action needed. Deprecated members are now getters read only when used, so a notice appears only in tests that use the member. The export-name parser no longer picks up keys from code after the exports object.

  Thanks @doutatsu for reporting this (#202).

- 8300ec6: **Native engine: preset mocks are built on first use in each test file, so long hot-runtime runs no longer run out of memory.** No action needed.

  - Every auto-detected preset mock was rebuilt for every file (about 900 `vi.fn()`s with twenty presets), and Vitest keeps every mock, so heap grew about 4 MB per file and a 1,000-file single-worker run ran out of memory.
  - Each mock is still fresh for every file. On the same run, worker heap after 562 tests fell from about 2.4 GB to 0.45 GB, and 1,000 files complete in about 1.5 GB.

- 99f3013: **`vitest-native/matchers` types `toHaveAnimatedStyle` and `toHaveAnimatedProps` under Vitest 4 and 5.** They were untyped on Vitest 4. No action needed.

  - The declarations now reference `vitest`, and both `vitest-native/matchers` and `vitest-native/rntl-matchers` use Vitest 5's `Assertion<R, T>` type parameters. A Vitest 4 project with `skipLibCheck: false` reports TS2428 for the differing type parameters.

- 525eb42: **`migrate` translates jest-expo presets.** `jest-expo` and `jest-expo/ios` become `reactNative()`, `jest-expo/android` becomes `reactNative({ platform: 'android' })`, and `jest-expo/universal`, `/web` and `/node` are reported with what to do instead. No action needed.

  - jest-expo does not mock React Navigation, so with a `@react-navigation/*` package installed the config sets `presets: { navigation: false }`, unless the project has its own root `__mocks__/@react-navigation`.
  - The packed Expo SDK 57 consumer runs expo-router's testing library under the config `migrate --write` generates.

- 4e5130f: **The navigation preset's `createNavigatorFactory` returns `{ Navigator, Screen, Group }`, and with `presets: { navigation: false }` React Navigation is compiled and runs for real.** No action needed.

  - expo-router failed at import with `Cannot read properties of undefined (reading 'Screen')`. The preset gains `LinkingContext`, `LocaleDirContext`, `UNSTABLE_UnhandledLinkingContext`, `DefaultTheme`, `DarkTheme`, `createStaticNavigation`, `ServerContainer`, `useLinkBuilder`, `useLinkProps`, `useLocale` and `useRoutePath`; `ThemeContext` starts as `DefaultTheme`.
  - A disabled preset's packages are detected like any other; `@react-navigation/*` was left uncompiled and failed at load. `renderRouter` and `router.push` from `expo-router/testing-library` work.

- 3f62964: **`jest.requireActual` and `jest.requireMock` apply the project's string `resolve.alias` entries.** A partial mock such as `jest.mock('@/services/api', () => ({ ...jest.requireActual('@/services/api'), fn: jest.fn() }))` threw `Cannot find module`. No action needed.

  - Aliases match the whole specifier or at a `/` boundary, the longest wins, and an extensionless result follows the platform's extension order (`@/Button` → `Button.ios.tsx`).
  - Regex aliases and custom resolvers cannot reach the worker; an unresolved specifier then says so.

  Thanks @swey for reporting this (#174).

- d4ae5bf: **The resolver-agreement warning (`'x' resolves to two different files`) prints only under `diagnostics`.** It fired on every test file for packages only Node requires, such as `test-renderer`, `nanoid` and Babel's source-map packages. No action needed. The warning now says it is a risk, not a proven duplicate, and that it compares against Vite's default main fields.

  Thanks @doutatsu for reporting this (#201).

- 963b35e: **`vitest-native/rntl-matchers` types RNTL's matchers on RNTL 12 and 13.** `toHaveTextContent`, `toBeVisible`, `toBeDisabled` and the others were untyped there, silently under `skipLibCheck: true`. No action needed.

  - The entry imported RNTL's matcher interface from `dist/matchers/types`, which exists only from RNTL 14. It now declares the interface itself, and a test compares it with the installed RNTL on each supported major.
  - Typechecked against RNTL 12.9, 13.3 and 14.0 with Vitest 4 and 5 and TypeScript 6 and 7.

- 8893464: **`vitest-native/rntl-matchers` typechecks under TypeScript 7 with RNTL 14 and `skipLibCheck: false`.** It failed with TS2320, because the entry and RNTL 14's global `jest.Matchers<R>` declared the matchers with different assertion types. No action needed.

- 9ab8270: **Under the hot runtime, the state a test file changes is restored and checked before the next file runs, and a failed restore names what it could not restore.** No action needed.

  - Covers Vitest timers and stubs, native overrides, known React Native state, environment changes, process and React Native listeners, global and `console` properties, `ErrorUtils` and Expo's runtime, so a leak no longer surfaces as an order-dependent failure in a later file.

## 0.13.0

### Minor Changes

- 0c25e74: New helper `extendPresetMock(pkg, overrides)`: merge overrides into a preset's module mock (and its `default` export) — e.g. to give expo-constants a real `expoConfig` or add an export a library calls that the preset does not model. Undone by `resetAllMocks()`.
- 1283531: React Native 0.87 joins the supported matrix

  The verified range is now 0.81–0.87: the CI matrix gains a 0.87 row (and the
  Vitest 5 column moves its newest-RN cell up), the workspace pins 0.87, and the
  published range statements follow. 0.87 removed InteractionManager, so its
  cross-check probe is version-gated rather than deleted — the 0.81–0.86 legs
  still compare it, and the published corpus count on the pinned version drops
  from 85 to 84 with the retirement recorded deliberately via the report's
  --allow-corpus-shrink flag.

### Patch Changes

- 9f4fd3c: Complete the expo-linking preset mock: add `addEventListener`, `resolveScheme` and `getInitialURL`, which expo-router's linking layer calls at render time.
- 4216b1f: Fabricated native-module stubs follow Expo method conventions: unknown `*Async` properties resolve a Promise (fixes expo-notifications crashing at import), and unknown PascalCase properties are memoized classes extending `SharedObject` (fixes expo-file-system's `class File extends ExpoFileSystem.FileSystemFile`).
- 36a1625: Mock registries are null-prototype objects, so a module or package name of `__proto__` becomes an ordinary entry instead of re-prototyping the registry. Hardens the published `mockNativeModule()` surface against prototype-polluting names — the same class CodeQL flagged on `extendPresetMock()`.
- b127e6d: Resolve React Native 0.87's gated deep imports, and mock its new AssetRegistry export

  React Native 0.87 ships an `exports` map whose deep-import surface sits behind
  Metro's `react-native-legacy-deep-imports` condition — and its Babel preset now
  compiles RN's own relative imports into bare deep specifiers
  (`react-native/src/private/…`), so RN's compiled graph self-references through
  paths plain Node refuses with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Under the native
  engine that failed almost every suite at collection. The engine now mirrors
  Metro: when Node's resolver rejects a `react-native/*` or `@react-native/*` deep
  specifier, the file is located by path from the package's real directory,
  platform extensions included, in the require hook, the ESM loader, and the
  precompiled registry's fall-through — where resolving by path keeps deep files
  on the registry's instances instead of loading twins. Inert on 0.86 and earlier,
  which have no exports map to reject anything.

  The mock engine gains `AssetRegistry` (a top-level export since 0.87),
  mirroring `@react-native/assets-registry/registry` down to its 1-based truthy
  ids. The compatibility checker no longer misreads the bare `get() {` inside
  0.87's new `Object.defineProperty` export blocks as an export named `get`, and
  the InteractionManager probe is version-gated: 0.87 removed the API outright,
  so the matrix keeps running it on every version that ships it.

  React Native 0.87 is not yet in the supported matrix — its release is inside
  the dependency cooldown window; adoption follows separately.

## 0.12.0

### Minor Changes

- 0dce12c: Compile what Node cannot run, and nothing else

  The native engine decided what to compile by NAME: a package was handed to the React
  Native Babel preset because auto-detection or a dependency-closure walk selected it.
  That guess was wrong far more often than it was right, and every way of being wrong
  looked identical — a parse error deep inside a package the project never mentioned.
  Babel's own emitted helpers, Metro's `lru-cache` chain and a pure-ESM validator all
  arrived that way, and each was answered by adding another name to exclude.

  The file answers precisely. If V8 can parse it, Node can run it, so compiling is
  optional; if V8 cannot, Node cannot, so compiling is required — the same question Node
  is about to ask, which is what makes it a fact rather than a heuristic. Files selected
  for compiling are now parsed first, and only compiled if the parse fails.

  What is given up is downleveling for Hermes: `const` to `var`, destructuring lowered.
  Measured across React Native's own sources and the installed ecosystem, that is the
  whole of what the preset does to a file V8 accepts, and it is behaviour-preserving on
  Node — arguably closer to what the package published. `__DEV__` is left standing and
  top-level requires are not inlined, so neither observable transform is affected.

  **This is a robustness change, not a speed one.** On this repository's native suite
  with a cold transform cache it measured 7.68s against 7.35s without the check: React
  Native's own sources need compiling either way (440 of 450 fail to parse), so the check
  mostly adds work here. The benefit is that a package Node can already run can no longer
  reach Babel, whatever put it on the list.

  Scoped to script-goal files. A `type: module` package is compiled exactly as before,
  because the loader hands those to Node as CommonJS and changing that is an interop
  question about named exports and live bindings that a parse cannot answer.

  Also adds `transform: { include, exclude }`. `exclude` names packages the engine must
  never compile, overriding auto-detection, the closure walk and the built-in lists —
  so a project that hits a case the parse check does not cover can unblock itself the
  same day instead of waiting for a release. The array form keeps its meaning.

### Patch Changes

- c118f51: Reset externalized packages a test file imports, under the hot runtime

  The hot runtime keeps a worker alive across test files and clears what each file
  loaded, so the next one starts fresh. That reset could only reach Node's CommonJS
  cache. A package reached through ESM `import` is held by Node's ESM registry, which
  has no invalidation API, so its module-level state — a store, a client, a cache —
  survived for the whole run. The second test file to touch such a package saw the
  first one's writes.

  The registry cannot be invalidated, but it is keyed by full URL, and the engine owns
  the resolve hook. The per-file reset now advances a generation counter that the
  loader stamps onto the resolved URL, so the next file imports a URL Node has not seen
  and evaluates the module again. React Native itself and the identity-sensitive
  modules already listed in the reset are exempt: for those a fresh instance is the
  bug, not the fix. Cost is bounded by ownership — a CommonJS package re-enters through
  `Module._cache`, which the reset already drops, so only a namespace wrapper is
  retained per generation.

  Correctness on a 135-file suite went from 126/135 to 135/135 against the same suite
  under stock isolation.

  The cost is re-execution, and it scales with how many externalized packages a test
  file imports — which is nothing to do with React Native, since RN and the packages
  that depend on it are inlined into Vite's graph and never reach this path. A suite
  where every file imports eight ordinary npm packages measured 1.14s to 1.77s, 55%
  more wall clock; stock isolation runs the same suite in 15.90s, so hot goes from
  13.9× to 9.0×. Suites that import few externalized packages pay close to nothing.

  Peak RSS does not grow: 946 MB with the stamp against 955 MB without, on that same
  suite. A CommonJS package re-enters through `Module._cache`, which the reset already
  drops, so only a namespace wrapper is retained per generation.

  `hotRuntime: { esmGeneration: false }` trades the correctness back for the speed.
  Nothing changes when the hot runtime is off; the counter is only installed by the hot
  worker.

  The hot-isolation suite reached this fixture through `require` deliberately, because
  the ESM path could not pass — it documented the hole rather than covering it. It now
  has an ESM twin, and the scale validation gained templates for the shapes that were
  missing from it entirely: real React Navigation, a navigation container wrapping a
  Modal, and a node_modules package holding module-level state. Navigation had never
  run under the hot runtime in any gate.

  The stamp is scoped away from the test stack itself — vitest, `@vitest/*`, chai, and
  this engine. The worker's runtime holds boot instances of these (the runner's
  SnapshotClient, chai's extended Assertion, the engine's registry), and a test file
  reaches the same packages through Node's ESM path; stamping those resolutions hands
  the file a twin runtime whose failures are emergent and order-dependent —
  `toMatchSnapshot` asking a SnapshotClient no one set up, fake timers flipping a copy
  of the state the runner never reads. The workspace gates cannot see this class: in
  the repository, the engine and the validation suites resolve outside node_modules,
  where the node_modules-scoped stamp never applies. It surfaced only on a packed
  install, running react-native-paper's suite under the hot runtime: 603/678 → 473/648
  before the exemption, 609/678 — above the recorded baseline — with it.

  The consumer tests gained the gate that class needs: the packed current-RN fixture
  now runs a hot-runtime leg whose probe asserts the resolution invariant directly —
  an ordinary node_modules package resolves generation-stamped while vitest,
  `@vitest/snapshot`, chai, and the engine never do — alongside behavioral checks
  (snapshots, fake timers, cross-file state reset from a packed install). Both
  mutations were run before trusting it: removing the exemption and disabling the
  generation mechanism each turn the leg red.

- c120d05: Match Metro's extension-major platform resolution order, verified against real metro-resolver

  Platform-file resolution interleaved its candidate extensions platform-major —
  every `.ios.*` variant before any `.native.*` before any bare extension. Metro
  resolves extension-major: for each source extension in order, it tries the
  platform variant, then `.native`, then bare (`.ios.js`, `.native.js`, `.js`,
  `.ios.jsx`, …). The difference selects different files when a module mixes
  platform variants across extensions: `Foo.native.js` beside `Foo.ios.tsx`
  resolves to `.native.js` under Metro — the `js` round finishes before `tsx` is
  tried — but resolved to `.ios.tsx` here, so a test could run a different file
  than the application ships. One shared list feeds both the Vite graph and the
  Node hooks, so the correction applies to both at once.

  The order had also been asserted by a unit test whose literals were written from
  the implementation — the gate encoded the mistake it existed to catch. The
  authority is now external: a differential oracle resolves a 160-case sweep of
  mixed platform/extension layouts (plus directory-index and per-extension cases)
  through real metro-resolver and through this package's resolver and requires
  byte-identical answers. The oracle runs against a pinned metro-resolver in the
  PR gate, and the weekly compatibility job bumps metro-resolver@latest alongside
  react-native@latest so upstream resolution changes surface as scheduled drift.
  Reverting the interleaving fails the oracle on the exact mixed-variant shapes
  described above.

- c27474e: Engine auto-detection requires react-native itself, not just its Babel toolchain

  `engine: 'auto'` chose the native engine whenever `@react-native/babel-preset`
  and `@babel/core` resolved — react-native itself was never checked, so an
  incomplete install (or a babel-only workspace) selected native mode and then
  failed later at React Native resolution with nothing pointing at the cause.

  Detection now requires all three. The check resolves rather than reads
  declarations — everything is located by walking node_modules upward from the
  project root, so a hoisted workspace install or Expo's transitive react-native
  counts without appearing in the project's own manifest. The fallback notice and
  the explicit-`engine: 'native'` configuration error both name exactly which
  dependencies did not resolve.

- 2fca83a: Compile a preset-shadowed package's pass-through entries when Node cannot run them

  Preset packages are shadowed: their bare and subpath imports are redirected to the
  preset mock before any file loads. The deliberate exceptions — package.json
  subpaths, assets, and Node-safe utility entries such as `mock`, `plugin`, and
  `jest-utils` — pass through to the real file. Some of those files only Metro can
  run: react-native-worklets publishes its own mock entry (`lib/module/mock.js`) as
  ESM `import` statements over a `module.exports = …` footer. And because the preset
  shadow is exactly what keeps such packages out of ecosystem detection, nothing else
  would ever compile them. A suite that maps the package onto its published mock —
  react-native-paper does, via
  `vi.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'))` —
  lost every test file whose component imports the package.

  Preset-shadowed package names now join the Node-side transform set, built in the
  worker from the same preset definitions that power the redirect, so user-supplied
  presets are covered alongside the auto-detected ones. Membership only makes a file
  eligible: `needsTransform` still gates every compile, so a pass-through Node can
  already run is served untouched. The hot runtime needed one more piece — its worker
  installs the require hooks at boot, before the setup file has built the preset
  mocks, and the install-once guard silently pinned that boot-time list; the guard
  now updates the transform matcher instead.

  What the served-as-published failure looks like depends on the Node version, and
  both shapes are cured: where Node lacks a `module` global the require(esm) retry
  throws "module is not defined in ES module scope", and on Node 24 — which defines
  `module` as a global — the file loads silently with EMPTY exports instead.

  The thrown shape also joins the explained-error family: the ReferenceError from a
  mixed ES-module/CommonJS file now gets the same actionable message as untranspiled
  JSX/Flow/TS SyntaxErrors — naming the owning package and the `transform: [...]`
  remedy — instead of a bare "module is not defined in ES module scope".

- 6bd6ec6: Scope the native transformer's toolchain to the project root instead of the process

  The transformer resolved its toolchain — `@react-native/babel-preset`,
  `@babel/core`, the flow-enums plugin, and the disk-cache directory — into module
  globals initialized by the first caller. `transformRN` accepts a project root per
  call, but a second root's calls silently reused the first root's resolved
  toolchain and cache. Registries for every project in a Vitest workspace are built
  in the one Vite main process, so two projects with different React Native or
  Babel versions could serve the first project's output to the second project's
  tests.

  Proven before fixing: a regression test gives two roots their own Babel preset
  whose plugin stamps a root-specific marker into every transformed file, and the
  second root's file came back carrying the first root's stamp. Toolchain state now
  lives in a per-root context — resolved requires, preset, lazily-loaded Babel,
  in-memory cache, and disk-cache directory each belong to one canonical (realpath)
  project root — and the same test asserts both call orders plus per-root cache
  directories.

## 0.11.1

### Patch Changes

- ea133b6: Only walk the dependency closure of packages the project declares

  Fixes a regression in 0.11.0. In a workspace holding both a library and a React
  Native or Expo application — the canonical monorepo shape — the application's mere
  presence could stop the library's tests from loading:

  ```
  ReferenceError: [vitest-native] Failed to transform '@babel/runtime' … for platform 'ios'.
  Caused by: ReferenceError: Cannot access 'v' before initialization
  Test Files 1 failed | Tests: no tests
  ```

  0.11.0 began compiling a detected package's dependency closure, so that a library
  shipping untranspiled JSX inside a transitive dependency would work without naming it
  in `transform: [...]`. Candidates are collected from every manifest in the workspace,
  which is how a library the application depends on is found at all — but applied to a
  closure walk, that breadth stops being free. A sibling Expo application is detected on
  its own manifest, and walking its dependencies pulled the entire Expo and Metro
  toolchain into the Babel transform set of a package that depends on none of it: over
  250 packages in a two-package reproduction, `@babel/runtime` and Metro's `lru-cache`
  chain among them.

  Those are not inert. React Native and Babel load them, and compiling the transform's
  own toolchain re-enters Babel while it is still initialising — which surfaces as a
  `Cannot access 'v' before initialization` naming files the project never mentioned.
  The existing toolchain exclusion covers what `@babel/core` reaches and so did not
  catch either of them.

  The closure now starts only from packages the run itself declares — the package under
  test, and any manifest above it, which is where a workspace keeping its React Native
  libraries at the repository root declares them. A package only a sibling declares is
  that sibling's business. Transitive compilation is unaffected: a dependency reached
  through the walk is declared by its own parent, which is what makes it transitive.

  Declaration rather than resolvability, deliberately: under pnpm every workspace member
  is linked into a hidden directory placed on `NODE_PATH`, so a sibling's dependencies
  do resolve from the package under test at run time, and testing reachability instead
  lets all of them straight back through.

  `@babel/runtime` and `metro` also now seed the toolchain exclusion, alongside
  `@babel/core` and the React Native Babel preset. Neither is reachable from
  `@babel/core`, so the existing exclusion let both through. `@babel/runtime` holds the
  helpers Babel _emits_, so compiled output across the ecosystem requires it at run
  time; Metro is the bundler the preset belongs to, and its `lru-cache` chain — the
  `yallist` in the report — is loaded the same way. This matters beyond the reported
  shape: an Expo application running its own tests declares `expo` legitimately, so its
  closure is walked and the same packages arrive by a route the change above does not
  affect.

  In the two-package reproduction the transform set drops from 253 packages to 5 — the
  declared dependency and its genuine closure. For an Expo application testing itself it
  drops from 251 to 171, with `@babel/runtime`, `yallist` and Metro's cache chain no
  longer among them.

  A closure member that publishes only ES modules is left alone as well. The walk is a
  guess that a detected package's dependencies might be untranspiled React Native
  source; `"type": "module"` with no `react-native` build anywhere in the manifest is
  the dependency saying the opposite. Compiling one anyway rewrote a package that
  publishes ESM into CommonJS and handed it to Node under that format. A genuine React
  Native library is unaffected — declaring `react-native`, by legacy field or by export
  condition at any depth, keeps it in the closure however it publishes — and so is any
  package named in `transform: [...]`, which was asked for explicitly.

## 0.11.0

### Minor Changes

- 912fb81: Add a `netInfo` preset for `@react-native-community/netinfo`

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

### Patch Changes

- f6e5a42: Check React Native API coverage on every pull request

  The mock engine is documented as covering every stable React Native export, and
  `check-compat` is the script that backs the claim: it parses the real `react-native`
  index and fails when a stable export has no mock.

  It ran only in the weekly compatibility workflow, and there against
  `react-native@latest`. The version actually pinned in the repository was never checked
  on a pull request. A change that moved the pinned React Native could add stable exports
  the mock did not cover and still go green, with the gap appearing days later as a
  canary failure against a different version.

  It now runs in the pull-request gate against the pinned React Native, on the one matrix
  leg where the React Native version is representative. The weekly canary keeps its own
  edge run — the two answer different questions.

  Currently 85 of 85 stable exports are covered.

- 12e1be3: Build with tsdown under bun's runtime

  tsdown's bin declares a Node shebang, and from 0.22 it calls `Promise.withResolvers` —
  an API Node did not ship until 21. Building on Node 20 therefore failed with
  `TypeError: Promise.withResolvers is not a function`, which blocked the dev-dependency
  updates that carry tsdown forward.

  `build` now invokes `bunx --bun tsdown`, so the bundler runs under bun's runtime, which
  has the API. The emitted `dist` is byte-identical either way, verified by hashing it
  from both runtimes against tsdown 0.21 and 0.22.

  This is a change to what the build toolchain runs on, not to what the package requires.
  The published `engines` floor of Node >= 20.19 is unchanged, and the Node 20 CI legs —
  which prove that floor and pin RNTL 12 and 13 as the lower-bound back-compat corners —
  keep running everything they ran before.

- c0b3bb3: `doctor` reports the real Node floor, and catches RNTL 14's missing peer

  Two cases where `doctor` said a project was fine while it was not.

  **The Node floor was hardcoded and compared on the major only.** It printed
  "floor: 20" and passed any Node 20.x, but the real floor moved to 20.19 — the version
  that added `require(esm)`, which the root entry point now depends on. Node 20.0 through
  20.18 were reported as supported. The floor is now read from this package's own
  `engines.node`, and compared as major and minor.

  **RNTL 14 declares `test-renderer` as a non-optional peer** and reconciles through it.
  Installing RNTL 14 without it is easy — npm only warns, and any `--legacy-peer-deps`
  install is silent — and the result is that every `render()` throws `Cannot find module
  'test-renderer'`, naming no file and no package. `doctor` reported no blocking problems
  for exactly that project. It now fails with the install command. RNTL 13 is unaffected
  and is not asked for the package it does not use.

- d0fb6ba: Compile a detected package's dependencies too

  `react-native-modal` — and any package like it — failed to import under the native
  engine with a bare `SyntaxError: Unexpected token '<'`, naming no file and no package.

  Detection asks each package's own manifest whether it declares `react-native`. The
  untranspiled JSX was not in `react-native-modal`; it was in `react-native-animatable`,
  which that package depends on. Nothing in the project declares it, so it was never a
  candidate, and it names `react-native` in neither `dependencies` nor
  `peerDependencies`, so the manifest test would have rejected it anyway. The documented
  remedy, `transform: ['react-native-modal']`, does not help — only naming
  `react-native-animatable` does, and nothing told anyone that.

  A detected package's dependency closure is now compiled with it. Two exclusions keep
  that safe, and both compute themselves rather than being lists to maintain:

  - **React Native's own dependencies.** The precompiled registry reaches those through
    pre-resolved absolute paths, so Node owns them; inlining one would give the same
    package two owners and two instances.
  - **The transform's own toolchain closure.** The transform runs `@babel/core`, so
    inlining anything Babel reaches means loading it re-enters the transform while Babel
    is mid-load.

  Detection stays under a millisecond, and 120 isolated test files run in the same time
  as before.

- cb98e1e: Never treat the package under test as an ecosystem dependency

  Under `engine: 'native'` in a workspace, a test file's own
  `import { describe, it, expect } from 'vitest'` could fail to load with:

  ```
  Error: Vitest cannot be imported in a CommonJS module using require().
  Test Files 1 failed | Tests: no tests
  ```

  Auto-detection reads the manifests of every workspace member, so the package under
  test appears in the candidate set whenever a sibling — or the repository root —
  declares it as a dependency. It also declares React Native, because it _is_ React
  Native code, so it was detected as a third-party ecosystem package: its directory
  became a `server.deps.external` pattern, Vitest handed every file beneath it to Node,
  and the loader compiled them to CommonJS. A test file's `import` then became
  `require('vitest')`, which throws before a single test runs. Suites using Vitest
  globals instead reported a pass while still running through Node's graph.

  Because it depended on whether anything happened to declare the package, the failure
  appeared in one workspace package and not another with an identical config, and was
  easy to misattribute to the `react-native` export condition selecting a CommonJS build
  of some dependency. It reproduces with no such dependency in the graph.

  Two changes:

  - A package whose directory contains the run root is the project, not a dependency,
    and is excluded from detection — including when a detected sibling's dependency
    closure reaches it. Workspace libraries the project merely depends on are still
    detected, which is what keeps them to a single module instance.
  - A first-party test file is never externalized, even when it sits inside a workspace
    library that is legitimately detected — the case an Nx-style run from the repository
    root produces. Test entries belong to Vitest, not to Node. Both conventions are
    covered: `*.test.*` / `*.spec.*` names, and files under a `__tests__` directory.
  - The same directory anchor is skipped for a package named in `transform: [...]`,
    which never passes through detection. A migrated Jest `transformIgnorePatterns`
    list naming the project's own package produced the identical failure.
  - When the run root sits above the package under test, a `test.include` pattern
    pointing into that package now identifies it, so its own source stays in Vite's
    graph too rather than only its test entries. A pattern with nothing literal before
    its first wildcard — Vitest's default — says nothing about which package is the
    project and is ignored, so workspace libraries the run merely depends on are still
    detected.
  - `react` and `react-is` join the packages that are never claimed by detection,
    alongside the test library and the renderers. A package declaring `react` as a
    runtime dependency rather than a peer dependency pulled it into the closure walk,
    leaving the engine's most duplication-sensitive package externalized and compiled
    as though it were untranspiled React Native source.

  One case remains where a package can still end up in both graphs, and it is now
  reported rather than silent: when an installed React Native package depends on the
  very package whose tests are running, Node loads that package's source alongside
  Vite's copy, and module-level state stops being shared. The engine warns, naming the
  file and the package that required it. It cannot be resolved by choosing an owner —
  the dependency is usually declared but never loaded, and honouring it would put the
  project's own test files back in Node's graph.

  The ownership rule the engine follows is written down in the header of
  `native/apply.ts`.

  The consumer suite now runs the workspace library's own tests, from inside the package
  and from the workspace root, and the whole monorepo fixture is exercised under pnpm as
  well as npm.

- d7ffd0a: Invalidate the React Native registry when any baked-in dependency changes, not just React

  The precompiled registry inlines React Native's own graph and leaves everything else —
  `react`, `invariant`, `nullthrows`, `@babel/runtime`, `stacktrace-parser` and others —
  as a normal `require` at a **pre-resolved absolute path** compiled into the emitted
  file. Those paths are only correct while the packages they point at stay where they
  were, but only React Native's own files were pinned against change.

  A previous fix named `react` in the cache key after upgrading React produced a null
  React dispatcher and React Native singletons that no longer compared equal. That fixed
  one package out of eleven. Naming the rest in the key one at a time would be a list
  that rots — the next dependency added to React Native's graph would not be on it.

  The resolved external targets are now recorded in the registry's manifest alongside
  React Native's own files, so the existing size-and-mtime check covers them. That works
  for both `node_modules` layouts: under bun and pnpm a version change moves the path, so
  the stat fails; under a flat npm or yarn tree the path survives but the file changes.

  Eleven packages are pinned in this repository's build. Verified by changing `invariant`
  under a warm cache: the registry rebuilds, where before it was reused unchanged.

## 0.10.0

### Minor Changes

- f21986f: The mock engine's Animated surface now matches React Native's

  Nine members React Native has were missing from the mock, so valid React Native code
  calling any of them threw under `engine: 'mock'` while working under `engine: 'native'`:
  `Animated.Node`, `Animated.Event`, `Animated.Interpolation`, `attachNativeEvent`,
  `Value.track`, `Value.stopTracking`, `Value.animate`, `hasListeners` and `toJSON`. All
  are implemented, following React Native's own semantics — `track()` kicks the tracking
  node immediately and replaces any previous one, `animate()` stops a running animation
  before starting the next and reports completion, `toJSON()` returns the current value.

  `stopAnimation` and `resetAnimation` moved off the shared base class onto `Value` and
  `Color`, which is where React Native puts them. They were reaching interpolations,
  which are derived and cannot be animated.

  `getValue()` remains — it is not a React Native API, and real React Native exposes only
  `__getValue()` — but now warns once per process, because the same call throws under the
  native engine. Use `__getValue()` for code that must run on both. It is the only
  remaining difference in this surface, and is recorded on the published fidelity page.

- 261b9ef: Make every declared entry point loadable, and require Node >= 20.19

  `require("vitest-native")` threw. The package's `main`, the `require` condition of the
  root export, and the `require` conditions of `./setup` and `./presets` all pointed at
  transpiled CommonJS bundles that could not be loaded at all: the root re-exports the
  presets, every preset imports `vi` from vitest at module scope, and vitest throws when
  it is reached through `require()`. A previous release gated this and recorded the three
  entries as known-unloadable rather than fixing them.

  The fix is not to change how the presets are written. Node has loaded ES modules from
  `require()` since 20.19, and the ESM build was always fine — only the transpiled
  CommonJS build tripped vitest's guard. Those three subpaths now declare a single ESM
  target for both conditions, and the dead CommonJS bundles are no longer emitted.
  `const { reactNative, presets } = require("vitest-native")` works, on both the oldest
  and newest supported Node. No documented API changed.

  `engines` now requires Node >= 20.19.0, the version that added `require(esm)` and the
  oldest version the matrix has ever tested. The previous `>= 20` advertised support for
  Node 20.0–20.18, which was never exercised and where the root entry cannot be required.

  Two gates were extended to keep this fixed:

  - `tests/package-exports.test.ts` resolves and loads every subpath by specifier under
    both `require` and `import`, rather than only loading declared targets by path. The
    original defect was invisible from the path side, since `dist/index.mjs` loaded fine
    throughout.
  - `scripts/check-exports.mjs` no longer ignores `cjs-resolves-to-esm` package-wide.
    Subpaths that are ESM-only on purpose are declared explicitly and checked against the
    manifest in both directions; every other subpath is checked with the rule enforced, so
    a dual entry cannot quietly lose its CommonJS build. Deriving that split from the
    manifest was tried and rejected: removing a `.cjs` moved the entry into the excused
    bucket, and the gate stayed green on the defect it exists to catch.

- a70c9f2: `hotRuntime` now isolates modules per file instead of repairing them

  A hot worker stays alive across test files, which is where its speed comes from —
  a fresh worker costs roughly 200ms of boot, and that dominates a run at scale. What
  it kept along with the worker was state: everything Vitest externalizes lives in
  Node's require cache, outside the reach of Vitest's own per-file reset.

  The previous model kept those modules resident and undid their damage afterwards,
  from a boot snapshot plus a call-stack heuristic that attributed each listener to
  import phase or test phase. That was approximate by construction, and wrong for a
  whole class: a `node_modules` singleton mutated by one file stayed mutated for the
  next, where stock isolation gives every file a fresh copy.

  The engine now re-executes instead of repairing. Anything the worker loaded to
  bootstrap itself stays; anything a test file caused to load is dropped and runs again
  on the next file. That is affordable because of the precompiled registry —
  re-instantiating React Native costs about 4ms in a warm worker.

  Measured: the idiomatic parity suite runs 135/135 under both engines with zero
  hot-specific failures, at 11.1× the default engine's speed; against Jest at 200 files,
  2.54× with 3.4× less peak memory.

  React, the renderers and `@testing-library/react-native` stay resident deliberately.
  Test files reach them through ESM `import`, which caches them in a registry Node
  offers no way to invalidate, so dropping the CommonJS entry would not replace them —
  it would add a second copy, and the two halves of the test stack would stop
  recognising each other.

  **Known limit.** A package a test file `import`s, rather than `require`s, cannot be
  evicted; only the CommonJS cache can be reset. Packages the engine inlines are
  unaffected, since those live in Vitest's own graph.

  `hotRuntime` remains opt-in. Making it the default needs validation against real
  applications, not only this repository's suites.

- 0bee726: Presets no longer declare named exports the real package does not have

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

- a70c9f2: Add `vitest-native/rntl-matchers`: types for React Native Testing Library's matchers under Vitest

  RNTL's matchers run correctly under this plugin but had no types for it. RNTL declares
  them only for Jest — augmenting the global `jest` namespace and the `@jest/expect`
  module — and neither reaches Vitest's `Assertion`. Every `expect(el).toHaveTextContent(...)`,
  `toHaveStyle`, `toBeVisible`, `toBeOnTheScreen` and the rest was
  `Property 'x' does not exist on type 'Assertion<...>'` for anyone who typechecks, despite
  passing at runtime.

  Reference the new types entry once, anywhere in the project:

  ```ts
  /// <reference types="vitest-native/rntl-matchers" />
  ```

  or add `"vitest-native/rntl-matchers"` to `compilerOptions.types`.

  It is opt-in rather than folded into the main types because
  `@testing-library/react-native` is an optional peer. A type import of an absent package
  is invisible under `skipLibCheck: true`, React Native's own default, but reports `TS2307`
  under `skipLibCheck: false` — which would break projects using the mock engine without
  RNTL. A project that references nothing loads nothing: the file is not part of the
  TypeScript program unless asked for.

### Patch Changes

- a70c9f2: `toHaveAnimatedStyle` and `toHaveAnimatedProps` now throw for a value that is not a rendered element

  Both matchers returned `{ pass: false }` when handed something without a `props`
  object. Under `.not` that result is inverted, so
  `expect(null).not.toHaveAnimatedStyle({ opacity: 1 })` passed — a query that matched
  nothing, or a value of the wrong shape, produced a green assertion.

  They now throw with the same message, which `.not` cannot invert. This matches React
  Native Testing Library, whose `checkHostElement` raises for the same case rather than
  failing softly.

  The positive form still fails as before; only the negative form changes, from
  silently passing to reporting the wrong receiver.

- a70c9f2: Cross-check the Animated API surface, not just its behaviour

  Every existing probe pins a behaviour, which cannot catch a member the mock invents:
  code written against one passes under the mock engine and throws under the native
  engine, because real React Native has no such method. Comparing the two surfaces
  directly found five such members, and nine real React Native members the mock does not
  implement — the same trap in reverse, where valid React Native code throws under the
  mock.

  The corpus now compares the member lists of `Animated`, `Animated.Value`,
  `Animated.ValueXY` and interpolations under both engines. Today's divergences are
  enumerated in an allowlist so they are reviewed rather than invisible, and anything new
  on either side fails. They are also recorded in the published known-differences table:

  - Extra on the mock: `getValue()` on values and interpolations (real React Native
    exposes only the internal `__getValue()`), plus `resetAnimation()`/`stopAnimation()`
    on interpolations.
  - Missing from the mock: `Animated.Node`, `Animated.Event`, `Animated.Interpolation`,
    `attachNativeEvent`, `Value.track`, `Value.stopTracking`, `Value.animate`,
    `hasListeners`, `ValueXY.toJSON`.

- f21986f: Name the cause of two failures that used to arrive unexplained

  A suite calling `jest.mock()` without `jestMockTransform()` in its plugins now says so.
  Vitest only hoists mocks written on the `vi`/`vitest` identifier, so the call runs after
  the imports it is meant to intercept and the mock silently does not apply — the test
  fails comparing real output against expected mock output, with nothing pointing at the
  cause. Reported once per run, with the config line to add.

  Two resolvable copies of React are now reported at startup. React throws
  `Cannot read properties of null (reading 'use')` when hooks run through a second copy,
  which React Native Testing Library surfaces as a failure to detect host component names
  and attributes to "an issue with your configuration". The warning names both paths and
  which package pulled the second copy in. `resolve.dedupe` still prevents the common
  case; this covers the ones it cannot reach.

  Two existing messages also say more: an unknown `hotRuntime` option now suggests the
  closest valid name and lists them all, matching what the top-level option check already
  did, and the reanimated preset explains why a React Native component was unavailable
  instead of only stating that it was.

- f21986f: The fidelity page now states what the cross-check covers, and the corpus reaches further

  A matching probe count says how many comparisons pass, not how much of the mock they
  reach. It reached 9 of 27 mocked APIs, and the page listed 81 green ticks without
  mentioning that — a reader would reasonably infer broader coverage than existed. The
  page now reports the covered fraction and names every API and component no probe
  touches. It is computed when the page is generated, so it moves with the corpus instead
  of going stale.

  Four probes were added over the untouched surface, chosen where a difference would be a
  real mock bug rather than an unavoidable device difference: the full `Easing` curve set
  including `bezier` and the parameterised `elastic`/`back`/`bounce`, `InteractionManager`,
  and a `DeviceEventEmitter` round trip.

  That found one: `InteractionManager.runAfterInteractions()` runs its task synchronously
  under the mock engine, while real React Native defers it a tick. Both run it exactly
  once, so this is timing rather than behaviour — but a test asserting immediately after
  the call passes under the mock and fails under the native engine. It is now recorded as
  a known difference; awaiting a tick, or using a `findBy*` query, works under both.

- 79e8b16: `doctor` now reports whether the config actually uses the plugin

  The config check was a substring test for "vitest-native", so a config whose only
  mention was a `// TODO: migrate to vitest-native` comment reported "uses
  vitest-native" and "No blocking problems found" — on a project where every React
  Native import fails. A config that imports the plugin but never adds it to
  `plugins: [...]`, or where the import has been commented out, read the same way.
  Diagnosing exactly that is the command's purpose.

  The check now reads the import, takes the binding name from it so an aliased import
  still counts, and confirms that binding is called. Import forms it does not recognise
  are accepted rather than risking a false alarm on a working project.

  `vite.config.*` is also recognised now. Vitest reads it when there is no
  `vitest.config.*`, but it was missing from the list, so a correct setup was told to
  run `vitest-native init` — advice that writes a second config which then takes
  precedence over the working one.

- b62e24f: `doctor` reports the run, not the directory it was typed in

  Two false reports from a workspace migration.

  Peers and engine detection resolved from the working directory. That is frequently
  not where the Vitest config lives, and under pnpm a package's node_modules holds only
  its declared dependencies — so a hoisted `@react-native/babel-preset` does not
  resolve from the package even though the real run finds it. `doctor` announced
  "engine 'auto' resolves to MOCK" for a project whose run banner said native.

  Resolution still happens from the directory the command was invoked in, which sees
  the most: Node resolution walks upward, so that directory already reaches its own
  dependencies and everything declared above it. The nearest directory holding both a
  Vitest config and a manifest is consulted only when something does not resolve there
  — the case where the command was run above the package that declares it — and the
  report says when it fell back.

  A config that builds on a shared one — common in a workspace — was also reported as
  not referencing vitest-native. It legitimately never mentions it, because the plugin
  is wired up in the package it extends. That case is now described rather than warned
  about, since this cannot tell from the file alone.

- a70c9f2: `doctor` no longer reports a blocking problem for an optional peer it does not block on

  A `@testing-library/react-native` version outside the supported range made `doctor`
  print "Blocking problems found" and exit non-zero. The plugin does not block on it —
  RNTL is an optional peer, and a version outside the range is a `console.warn` there
  — so a project that runs its tests fine could still fail a `doctor` check. It is now
  reported as a warning, matching what actually happens at run time. The genuine
  blocker in that area is unchanged: RNTL 14 on a Node below 22.13 still fails, because
  RNTL 14 declares `engines: ^22.13.0 || >=24`.

  The supported range was also written three times — in this package's
  `peerDependencies`, in the plugin's startup check, and again as a hardcoded major
  comparison inside `doctor` — with nothing holding them together. It now comes from
  the same table the other peers use, and a test asserts that table against the
  published `peerDependencies` so the two cannot drift apart.

- b773a2d: Auto-detected CommonJS packages expose all of their named exports again

  Node decides a CommonJS module's named exports with `cjs-module-lexer`, which reads
  the source statically and stops at shapes it cannot follow. Given ordinary
  hand-written CommonJS:

  ```js
  module.exports = { Banner({ label }) {}, renderCount: () => n };
  ```

  Node reports the named exports as `["Banner", "default", "module.exports"]` —
  `renderCount` is missing, and a name that is not an export appears. That is plain
  Node behaviour, reproducible with no plugin involved.

  It became reachable when auto-detected React Native packages moved from Vite's graph,
  whose interop enumerates the real object at run time, into Node's. `import { useFoo }
  from 'some-rn-lib'` could then fail with "does not provide an export named", for the
  hand-written CommonJS libraries auto-detection exists to support.

  Transformed packages are now served with the dead `0 && (module.exports = { … })`
  hint that the lexer does understand — the same mechanism React Native's own index
  facade already used. Names come from the transform's own output, read from its AST,
  rather than from requiring the module: the ESM hook runs on the module-loader thread,
  where the CommonJS hooks that compile JSX are not installed, so requiring there fails
  outright. A module whose shape is not statically knowable (`module.exports =
  someValue`) emits no hint and keeps Node's own detection, which is no worse than
  before.

  The package budget is re-baselined to ~5% above the measured artifact, which is what
  its own policy asks for, rather than left to fail on the next change.

- c1c973d: Gate that every declared entry point actually loads

  The published `exports` map declares eleven subpaths, and a test checked that each
  one points at a file that exists. Existing is not loading: three of the declared
  CommonJS entries throw the moment they are required, and nothing noticed because
  nothing ever loaded them.

  `./dist/index.cjs` — the package's `main`, and the `require` condition of the root
  export — is one of them. The root entry re-exports the presets, every preset imports
  `vi` from vitest at module scope, and vitest refuses to be required from CommonJS. So
  `const { reactNative } = require("vitest-native")` fails, while the ESM entry the
  plugin is normally loaded through works. `./dist/presets.cjs` and `./dist/setup.cjs`
  fail for the same reason.

  Each declared runtime entry is now imported (or required, by extension) during the
  suite. The three that cannot load are listed explicitly with the reason, and one that
  starts loading fails as a stale entry, so the list cannot outlive the problem it
  describes. Every `vi` call sits inside a preset factory that only runs in a worker, so
  moving the import is a fix to how the presets are written rather than to the export
  map; it is not part of this change.

- 3189ff9: Thrown errors now carry a class and a stable code

  Errors raised by the plugin were plain `Error` instances whose only identity was their
  message text. They are now `VitestNativeError`, or `VitestNativeTypeError` where a
  `TypeError` is the right shape, each carrying a `code` from a fixed set.

  What this changes for a consumer is the `name` on the error: it reads
  `VitestNativeError` rather than `Error`, and that survives Vitest's serialisation of
  errors out of a worker, which keeps `name`, `message` and `stack`. The `code` is
  readable on errors thrown in the Vite main process — configuration and resolution
  failures — but is an own property, so it does not survive that same serialisation for
  errors raised inside a worker.

  The classes and an `isVitestNativeError` guard are not importable from the package:
  there is no `vitest-native/errors` entry point, and the main entry does not re-export
  them. Adding one is a separate decision, since it is a twelfth public export path to
  support, and it would also let the bundled entries self-reference `errors.mjs` instead
  of carrying a second copy of it.

- a70c9f2: Flow enums are no longer dropped by the native engine's transform

  React Native's Babel preset carries both `@babel/plugin-transform-flow-strip-types` and
  `babel-plugin-transform-flow-enums`, but in separate `overrides` entries that Babel
  merges into a single pass with strip-types first. It therefore deleted `export enum
  Foo {}` as if it were a type annotation, while leaving the code that referenced `Foo`
  in place — a module that loaded cleanly and threw `ReferenceError` on a path nothing
  had warned about. In React Native 0.86 this made `VirtualViewMode` and
  `VirtualViewRenderState` undefined when imported from `react-native`.

  The enum plugin now runs ahead of the preset, which Babel's plugin/preset ordering
  guarantees. Measured identical on preset 0.85.3 and 0.86.1, so this is the preset's
  ordering rather than a version mismatch.

  The precompiled registry's cache key now includes the transform's version too. It
  stores transformed module source, and neither the preset version, the Babel version nor
  the package version changes when the transform's own configuration does — so a warm
  registry would have kept serving modules built before this fix.

- a70c9f2: Remove the hot runtime's last dependency on Vitest's internal worker state

  The hot runtime re-enabled Vitest's per-file isolation by mutating
  `state.ctx.config.isolate` inside the worker — a shape nothing contracts. It now
  performs the two operations that flag was buying (`mocker.reset()` and a clear of the
  evaluated module graph) directly, through public API: the `onModuleRunner` hook of
  `vitest/worker`'s `init()`, and Vite's `ModuleRunner.clearCache()`.

- a70c9f2: Complete the `jest` global's API surface

  Eleven documented Jest members were absent from the `jest` global, so a migrated suite
  calling one got `TypeError: jest.X is not a function` — the bare failure the shim's
  signposting already existed to prevent. The gaps included siblings of members that
  were covered: `isolateModules` was signposted but not `isolateModulesAsync`,
  `deepUnmock` but not `dontMock`.

  Three had a Vitest equivalent under a different name and now use it:

  - `jest.dontMock(m)` → `vi.doUnmock(m)`
  - `jest.setMock(m, exports)` → `vi.doMock(m, () => exports)`
  - `jest.now()` → the current clock, faked or real

  The rest throw an error naming the API and its closest migration, as the other
  unsupported members already did: `isolateModulesAsync`, `unstable_mockModule`,
  `replaceProperty`, and the automock family (`enableAutomock`, `disableAutomock`,
  `autoMockOff`, `autoMockOn`, `onGenerateMock`), which has no Vitest counterpart at all.

- e6cb458: `jest.mock` with an async factory keeps its named exports

  `jestMockTransform()` wraps each `jest.mock` factory so its return passes through
  Jest's CommonJS interop. The wrapper handled a synchronous return only. An async
  factory — or any factory returning a promise — handed the promise itself to the
  interop, where it matched the object branch: a promise has no own enumerable keys and
  no `default`, so the result was `{ default: Promise }`. Every named export
  disappeared, and the failure surfaced as

      No "readSetting" export is defined on the "./settings-store" mock.
      Did you forget to return it from "vi.mock"?

  naming a `vi.mock` the author never wrote.

  Interop now applies to the resolved module. The check is by object tag rather than for
  a `then` method: a module may legitimately export a function named `then`, and
  awaiting that calls it with `(resolve, reject)` and never settles, hanging the test
  file instead of failing it. `async` functions and `Promise.resolve` only ever produce
  native promises, which the tag identifies across realms.

- a70c9f2: `jest.setTimeout(ms)` now applies instead of being ignored

  The jest-compat shim stubbed `jest.setTimeout` as a no-op, on the grounds that `vi`
  had no equivalent. `vi.setConfig({ testTimeout })` is one, and it applies for the rest
  of the file — the same scope Jest gives `jest.setTimeout`, since Vitest resets the
  config after each test file.

  The no-op did not crash anything, which is what made it costly. A suite opening with
  `jest.setTimeout(30000)`, routine for slower React Native suites, silently kept
  Vitest's 5s default: its slow tests failed on time while the line meant to prevent
  that sat above them. A 6s test under `jest.setTimeout(20000)` failed with "Test timed
  out in 5000ms" before this change and passes after it.

  A non-numeric argument is still ignored rather than written into the config.

- a70c9f2: Add `LayoutAnimation.easeInEaseOut()`, `.linear()`, `.spring()`, `.setEnabled()` and `.checkConfig()` to the mock engine

  The preset shortcuts were missing entirely, so `LayoutAnimation.easeInEaseOut()` — the
  idiomatic one-liner in a React Native codebase — threw "is not a function" under the
  mock engine while the same call worked under the native one. They now bind to
  `configureNext` with the matching preset, exactly as React Native defines them, so a
  test asserting on `configureNext` sees the call either way.

  Found by diffing the mock's member list against real React Native's across every mocked
  namespace. A behavioural test cannot catch a member that is not there, so the
  cross-check corpus now covers this shape too.

- a70c9f2: Stop claiming a preset covers the legacy `react-native-vector-icons` package

  The preset auto-detect map listed both `@react-native-vector-icons/common` and the
  unscoped `react-native-vector-icons` against the `vectorIcons` preset. That preset
  shadows exactly one module — the shared factory the v10+ scoped icon-set packages
  are built on. The legacy package predates that split and does not use it, so the
  preset had nothing to give it.

  A package name in that map means "a preset shadows this, so its real source never
  loads", and three things act on it: the package is excluded from React Native
  ecosystem auto-inlining, and both `doctor` and `migrate` report it as already
  handled. A project on the legacy package therefore had its untranspiled source
  neither shadowed nor transformed, which is the parse failure auto-inlining exists to
  prevent, while the tooling reported it as covered.

  The mapping is removed, so `react-native-vector-icons` is auto-inlined and
  transformed like any other React Native ecosystem package. Projects on the scoped
  packages are unaffected.

  Presets are also now checked against the map: every package name it lists must be
  one the named preset actually declares a module for. Only packages installed in this
  repository's own test suites exercised that link before, so a mapping that pointed
  nowhere could go unnoticed.

- 1c4c7f7: Update `magic-string` to 1.x

  `magic-string` is one of the package's two runtime dependencies, so the major bump
  changes what consumers install. The four methods the `jest.mock` hoisting transform
  uses — `overwrite`, `appendLeft`, `appendRight`, and `generateMap` — are unchanged in
  behaviour, and the hoisting suite passes against the new version.

- c1c973d: Resolve `.json` imports, and try extensions in Metro's order

  The plugin replaces Vite's `resolve.extensions` wholesale with a platform-ordered
  list, so anything missing from that list stops resolving. `json` was missing, while
  Metro treats it as a source extension — `import config from './config'` next to a
  `config.json` worked in the app and failed in the test, with a bare "Cannot find
  module".

  The order within each platform group was also inverted relative to Metro. Metro's
  default `sourceExts` are `["js", "jsx", "json", "ts", "tsx"]`, so it picks `Foo.js`
  over `Foo.tsx`; the plugin picked `Foo.tsx`. A project with a compiled file beside
  its source therefore tested a different file than it shipped. Both graphs now try
  `.<platform>.{js,jsx,json,ts,tsx}`, then `.native.*`, then the bare extensions, which
  is Metro's own order.

  `.mjs` and `.cjs` remain unresolvable without an explicit extension, matching Metro.

  The list was written out twice — once for the Vite graph and once for the Node
  graph — with nothing holding the two together; a divergence would have resolved one
  file in one graph and a different file in the other for the same import. Both are
  now derived from a single definition, and a test asserts they agree.

- a70c9f2: `migrate` no longer emits Jest's `<rootDir>` token into the config it generates

  A Jest `setupFiles` or `setupFilesAfterEnv` entry written as `<rootDir>/jest.setup.js`
  — the form nearly every real Jest config uses — was copied into the generated Vitest
  config verbatim. Vitest does not substitute `<rootDir>`, so it resolved the string as
  written and every test file failed to load with
  `Cannot find module .../<rootDir>/jest.setup.js`, while the migration report listed
  the mapping under "Mapped automatically".

  Setup-file paths are now rewritten the same way `moduleNameMapper` targets already
  were, as `fileURLToPath(new URL('./jest.setup.js', import.meta.url))`. `testMatch`,
  `include` and `moduleNameMapper` already stripped the token; setup files were the one
  path that did not.

- 599d0e0: Give React Native ecosystem packages a single owner

  The native engine runs two module systems: Vite resolves the test graph, and Node's
  CJS resolver serves everything externalized. Auto-detected ecosystem packages were
  inlined, so Vite executed them — which left Node either unable to load them at all,
  or holding a second copy with its own module-level state.

  The second case is the dangerous one. Nothing fails: a store configured through one
  copy simply reads back unset through the other, so a translated label renders as an
  empty string and the test compares empty output against expected text with nothing
  pointing at the cause.

  They are now externalized and transformed by the Node hooks, exactly as React Native
  itself already is, so one graph owns them and a single instance follows from the
  design rather than from Vitest's externalization heuristics.

  Both properties inlining provided are kept, and were measured rather than assumed:
  `vi.mock()` still intercepts these packages, and their module state still resets
  between test files. Node can now also load them at all — previously a `require` of
  an ecosystem package failed on its untranspiled source, since the hooks transformed
  only React Native and the packages named in `transform`.

  This also fixes a reported failure that looked unrelated: a Flow type import inside a
  PLATFORM VARIANT of an auto-detected package — `datetimepicker.ios.js` — failed to
  compile until the project named the package in `transform` by hand. The detector had
  not missed it; the package declares react-native in peerDependencies and was found.
  The variant was simply reached through Node, which had no way to strip Flow from a
  package Vite owned. One owner fixes both halves: the resolver picks the variant and
  the same hooks that transform React Native strip its types.

- 4be3eab: Switch a single auto-detected preset off with `presets: { name: false }`

  `presets` accepted only an array, and providing one replaced auto-detection entirely.
  A project that needed to drop one preset — for example the navigation preset, because
  its stub means a real `NavigationContainer` never fires `onReady` — had to enumerate
  every other detected preset by hand. That list then rots silently as dependencies
  change: add a library and its preset is not applied, because the hand-written array
  does not mention it.

  Passing an object keeps auto-detection and names only what to drop. The array form is
  unchanged.

- b015c89: Rebuild the React Native registry when React changes

  Upgrading React while staying on the same React Native served a precompiled registry
  built against the previous React. The native engine then failed in ways that look
  nothing like a stale cache:

  ```
  TypeError: Cannot read properties of null (reading 'useContext')
  AssertionError: expected [Function Dimensions] to be [Function Dimensions]
  ```

  — a null React dispatcher and React Native singletons that no longer compare equal,
  which is the duplicate-instance failure the registry exists to prevent.

  The registry is disk-cached under `node_modules/.cache/vitest-native` and keyed on
  React Native, `@babel/core`, `@react-native/babel-preset`, the platform, and this
  package's own version. `react` was missing, and the manifest check could not stand in
  for it: that stats React Native's own files, which do not change when React alone is
  upgraded. The cache was therefore reused when it should not have been, and deleting
  the cache directory by hand was the only way out.

  `react` is now part of the key. Because the failure is self-clearing on a later run,
  it was easy to read as flakiness rather than as a stale cache.

- 9428119: Report when the precompiled React Native registry cannot be built

  The native engine compiles React Native's module graph into a single file, and falls
  back to per-file module loading when it cannot. The fallback is correct — tests still
  run and no result changes — which is what made it hard to notice: a degraded run
  looked exactly like a healthy one, only slower. Measured on this package's own native
  suite, roughly 1.4x, and the per-file cost compounds on a larger suite.

  Neither failure path said so. The build path logged only under `diagnostics`, which
  is off by default, and the cache-directory path returned without a message under any
  setting. Both now warn once per distinct cause, naming the cause and stating that
  results are unaffected. Setting `VITEST_NATIVE_NO_REGISTRY=1` remains silent, since
  that path is a request rather than a failure.

- 44432f0: `jest.requireActual` resolves relative paths against the calling file

  Jest resolves `jest.requireActual('../thing')` against the module that called it. The
  compat layer backed it with a single `createRequire` anchored at the project root, so
  bare specifiers worked and relative ones escaped the source tree: MODULE_NOT_FOUND,
  with a requireStack pointing at `<projectRoot>/package.json` — a confusing place to
  be sent when the file sits beside the test. A migration reported this breaking five
  files until they shimmed around it.

  Relative specifiers now resolve from the caller, taken from the stack, since these
  are runtime calls on the `jest` global rather than rewritten imports. Bare specifiers
  still resolve from the project, and a caller-relative miss is reported rather than
  retried against the root, which could otherwise resolve an unrelated file that
  happens to sit at the same relative path.

- a70c9f2: `resetAllMocks()` now resets every stateful mock, including `NativeAppEventEmitter`

  The helper reset a hand-written list of seven mocks. `NativeAppEventEmitter` is a
  second event-emitter instance — the mock registry builds one per name, so it is not
  the same object as `DeviceEventEmitter` — and it was not on the list. A listener
  registered on it survived `resetAllMocks()` and fired again in the next test.

  The helper now resets every mock that exposes a `_reset`, so a stateful mock added
  later is covered on arrival rather than needing to be remembered here.

- 69c761b: Report when a package resolves to two different files across the two module systems

  The native engine runs two resolvers: Vite resolves the test graph, and Node's CJS
  resolver serves everything externalized. The plugin points Vite at React Native's
  fields — `react-native`, `module`, `jsnext:main`, `jsnext` — and `main`, which is all
  Node's resolver consults, is not among them.

  Any package publishing a `react-native` field, which is ordinary across the ecosystem,
  or a `module` field, which is ordinary for anything dual-format, therefore resolves to
  a different file on each side. When both graphs load it the package exists twice, with
  separate module-level state, and nothing says so: a store written through one copy
  reads back unset through the other, so values arrive empty and the failure surfaces far
  from its cause.

  The Node-side resolver now compares each package it resolves against the file Vite's
  field order would choose, and reports the pair once per package when they differ,
  naming the field responsible and what diverging state means. It does not fire on a
  suite where the two agree.

  This is a diagnostic, not a fix: making the two resolvers agree is a separate change.

- 599d0e0: Resolve format-only package fields the way Node does, so they load once

  The native engine runs two module systems. Vitest forwards `resolve.conditions` to
  the worker's Node, so packages using an `exports` map resolve identically on both
  sides. Legacy top-level fields have no such bridge: Vite reads `module`, Node reads
  `main`, and a package publishing both is loaded twice with separate module-level
  state. Nothing fails — a store written through one copy reads back unset through the
  other, so values arrive empty and the failure surfaces far from its cause.

  A `module` field selects a different FORMAT of the same code, so Vite is now pointed
  at `main` for those packages and the pair collapses into a single instance.

  A `react-native` field is left exactly as it was. That one selects a different
  IMPLEMENTATION — the native build rather than the web build — and Metro resolves it
  ahead of `main`, so the engine must too. Aligning it downward would quietly load the
  web build, which is a fidelity regression rather than a fix; packages using it stay
  split and are reported by the duplicate-instance warning instead.

  Packages the engine inlines and transforms are also untouched, since Vite is meant to
  own their source.

- 3a0dc69: Cover the native-stack surface in the screens preset

  A real native-stack never reached `onReady`, so the screen stayed empty with nothing
  thrown, until the project shipped its own mock of react-native-screens. The preset
  declared 12 exports where the package has 26.

  The gap was closed against react-native-screens 4.26.2's published type surface
  rather than against the names that had been noticed missing — the report named six,
  and checking the package found sixteen. `ScreenStackItem` is the one that matters
  most, since native-stack renders through it.

  `ScreenContext` is a real React context rather than a component stub, because
  native-stack calls `useContext` on it, and `useTransitionProgress` returns a progress
  shape rather than an empty mock. The v3 names `NativeScreen` and
  `NativeScreenContainer` are kept so a project on the older major does not lose them.

  Not covered: `RNSScreensRefContext` and `GHContext`, which are not entry-point
  exports — they live in the package's `contexts` module and are reached by deep
  import.

- a70c9f2: The snapshot serializer no longer throws on a circular prop, and produces stable output

  Three fixes to the serializer registered for every project by the plugin's setup file.

  A prop holding a circular object — a navigation object, a store, anything with a
  parent back-reference — raised `TypeError: Converting circular structure to JSON`, so
  the test failed with a type error instead of producing a snapshot. Cycles now print
  as `[Circular]`.

  Object keys inside a prop value are sorted, so two structurally equal props serialize
  identically. Previously `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produced different
  snapshots, and a rewrite that changed nothing could churn a snapshot file. Prop names
  were already sorted; this applies the same rule inside values. Array order is
  preserved, since it is meaningful.

  Functions and `undefined` nested inside a prop are shown rather than dropped:
  `{ onPress: fn }` used to print as `{}`, an empty object that reads like missing data.

  Non-element children are also indented one level less, matching sibling elements.

- 687b79f: Document the versioning contract, and check it against the build

  The package shipped stability _labels_ — which surfaces are release-supported, which
  are experimental — but never a semver contract: which exports and options are covered,
  what a major may break, how the peer ranges may move, and what a deprecation cycle
  looks like. `docs/versioning.md` states all of it, and ships with the package.

  The document enumerates the public surface, so it is checked rather than trusted.
  `tests/versioning-contract.test.ts` loads each documented entry point and asserts the
  export lists match exactly in both directions, that the stated preset-factory count is
  right, and that the documented plugin options are exactly the keys the validator
  accepts. A surface added without a contract update fails the suite, as does a contract
  naming something that does not exist.

- 4285a77: Auto-detection sees workspace members, so running from a monorepo root works

  Package auto-detection walked manifests upwards from the run root. In a workspace the
  run root is frequently _above_ the package under test — Nx invokes tasks from the
  workspace root, and Vitest's root follows the working directory — so the app's own
  dependencies live in a manifest that walking up never reaches.

  A workspace library therefore missed detection, stayed in Vite's graph while Node
  loaded it too, and came apart into two module instances with separate module-level
  state. Reproduced in a pnpm workspace: the same config and the same code passed from
  the app directory and failed from the workspace root, with state written through one
  graph reading back unset through the other.

  Detection now also reads the manifests of workspace members declared by any manifest
  it finds, including pnpm's separate `pnpm-workspace.yaml` list, and resolves each
  candidate from whichever of those directories can see it — necessary under pnpm,
  where a workspace package is linked only into the package that depends on it.

  The consumer gate now runs the monorepo fixture from the workspace root as well as
  from the app directory, so the invocation that exposed this is covered rather than
  assumed.

## 0.9.0

### Minor Changes

- 3b08c19: Actionable errors and engine transparency for migration failure points.

  - **Untransformed-package explainer**: when an externalized `node_modules` file throws a SyntaxError that fingerprints as untranspiled JSX/Flow/TypeScript (`Unexpected token '<'` and friends), the error now names the owning package and states the fix — `reactNative({ transform: ['<pkg>'] })` — with a link to the migration guide, instead of a bare Node compile stack. This is the single most common migration blocker observed in real-app bake-offs.
  - **Decorated Babel failures**: a Babel crash inside the native transform now reports the file, platform, and owning package at the single transform choke point (ESM loader, CJS require hook, and `requireActual` all inherit it), chaining the original error as `cause`.
  - **Engine banner**: one log line per process states which engine actually ran (`engine: native — real react-native@X` / `engine: mock — …`), so a silent `auto` fallback can never masquerade as real-RN testing.
  - **Config-time fail-fast**: explicit `engine: 'native'` without `@react-native/babel-preset` / `@babel/core` now fails at config time with install instructions, instead of starting the run and dying inside the loader. The `auto`→mock fallback notice is now emitted via `console.warn`, and the Flow-strip parse-failure warning is always visible (no longer diagnostics-gated).
  - **jest-compat signposts**: `jest.isolateModules`, `jest.createMockFromModule`, `jest.genMockFromModule`, and `jest.deepUnmock` now throw errors that name the API and its closest Vitest migration instead of bare `is not a function` TypeErrors; `jest.retryTimes` warns once and continues instead of crashing the suite.

- a6a6ae3: The mock engine's Animated is now a live node graph, matching real React Native's semantics (previously it was a snapshot system — the largest known fidelity gap, and the class real-app bake-offs had to monkeypatch around).

  - **Derived nodes are live.** `interpolate()` (numeric AND string), `add`/`subtract`/`multiply`/`divide`/`modulo`, and `diffClamp` recompute from their sources on every read and re-notify listeners when any source moves. Numeric interpolations chain; derived nodes are valid operands (previously coerced to 0); chaining off a string interpolation still throws like RN.
  - **Animated components re-render.** `Animated.View`/`Text`/`Image`/`ScrollView`/`FlatList`/`SectionList` and `createAnimatedComponent` wrappers subscribe to every node in their style — a `setValue()` or `timing().start()` after render updates the rendered style, so `toHaveStyle` assertions see current values. Gated against real React Native by three new crosscheck probes (post-render `setValue`, live interpolation, live transform) — the corpus is now 78/78.
  - **Offsets are real.** `setOffset`/`flattenOffset`/`extractOffset` implement RN's semantics (the canonical PanResponder drag pattern) on `Value` and `ValueXY`; `ValueXY.addListener` now reports the joint `{x, y}` value.
  - **`__getValue()` exists on plain values** (RN's own tests call it), and `AnimatedValueXY`/`AnimatedColor` gained `__getValue`/`getValue` parity.
  - **`useAnimatedValue`/`useAnimatedValueXY`/`useAnimatedColor` are real hooks**: the value is `useRef`-memoized and survives re-renders (previously every render minted a fresh node, silently resetting animation state — and rebuilt the entire Animated namespace to do it). Consequently they must now be called inside a component, exactly like on-device.

- ac70dec: Compile React Native packages from `node_modules` automatically

  Most of the React Native ecosystem publishes untranspiled source — JSX, Flow, or
  TypeScript — assuming Metro will compile it. Node cannot run that, so every project
  had to discover its own allowlist one `SyntaxError: Unexpected token '<'` at a time
  and maintain it by hand in `transform: [...]`.

  `engine: 'native'` now detects those packages: any dependency declaring `react-native`
  in **its own** manifest is compiled with the project's React Native Babel preset and
  inlined into the test graph. The manifest is the authority rather than a name pattern —
  `react-native-*` misses `@gorhom/bottom-sheet` and would wrongly claim `react-native`
  itself.

  Because those packages land in the graph Vitest owns rather than being externalized,
  `vi.mock('the-package')` now reaches them too. Mocking `react-native` itself still does
  not change what a library sees — its own imports compile to `require`, which reaches
  React Native directly.

  Dependencies are read from the project's manifest and every manifest above it, so a
  workspace that declares its React Native libraries at the repository root is covered.

  Excluded automatically: packages a preset already shadows (their real source never
  loads) and the test infrastructure — `@testing-library/react-native` and the renderers,
  where a second copy in the graph corrupts rendering. `transform: [...]` keeps its
  existing meaning for anything detection misses, and takes precedence over it.

- bbbfc5d: Stub Expo's dev-server messageSocket under the native engine.

  `expo`'s `Expo.fx` requires `async-require/messageSocket` whenever `__DEV__ && globalThis.expo`, and that module throws at load time when the bundle wasn't served over HTTP ("Cannot create devtools websocket connections in embedded environments"). Under the native engine this took down any suite importing an `expo-*` package (e.g. `expo-image`) — the primary blocker for Expo apps. The module's only job is a devtools websocket to a live dev server, an environment that doesn't exist under Node, so it is now stubbed to a no-op via the boundary mechanism — matching Jest's dev-server-layer mocks. All published variants are covered (`build/` output and `src/` TS sources, plain and `.native`), and the `.ts`/`.tsx` require handlers now consult boundary stubs, which previously only `.js` did.

  Validated against the obytes Expo template bake-off: the login-form suite (previously import-time dead) now passes, 34/40 → 38/40 overall with the two remaining failures pre-existing and unrelated (bottom-sheet mock completeness).

- 1a3bcea: New CLI: `npx vitest-native init | doctor | migrate`.

  - **`init`** writes a ready-to-run Vitest config (`--jest-compat` for the exact jest-compat block the migration guide documents; refuses to overwrite without `--force`).
  - **`doctor`** diagnoses the environment read-only: Node floor (including the RNTL 14 ⇄ Node 22.13 interaction, which previously surfaced only as a raw runtime failure), required peers against supported ranges, which engine `auto` resolves to and why, every auto-detected preset, Expo presence with known-limits pointer, and config presence. Exits non-zero on blocking problems.
  - **`migrate`** analyzes the project's Jest configuration (`package.json#jest` or `jest.config.{js,cjs,json}`) and reports key-by-key what maps automatically (setup files, path aliases, `transformIgnorePatterns` allowlists → `transform: [...]`, timeouts, mock hygiene flags), what the auto-detected presets already cover (deletable manual `__mocks__` and setup lines), what needs a human, and what drops — ending with a complete suggested config. Dry-run by default; `--write` saves it. Test files are never edited (`jestMockTransform()` handles top-level `jest.mock` at runtime).

  The packed-tarball consumer suite exercises the bin end-to-end (`npx vitest-native doctor|migrate`).

- ac70dec: Precompile React Native's require graph so isolated test files stop paying to re-load it

  The native engine runs React Native's real JavaScript, and with isolation on — the
  default — that graph was re-instantiated for every test file: roughly 440 separate
  Node module loads each time, one per RN source file. Measured on RN 0.86, that cost
  ~59ms for a typical test's slice of React Native and ~110ms for the full public API,
  per file.

  React Native's graph is now walked once per (RN version × platform × Babel
  toolchain) and emitted as a single file of lazy per-module factories with every
  require target resolved ahead of time. A test file pays one read and one compile
  instead of ~440. The registry is built in the Vite process, so the cost is paid once
  per run, and it is cached under `node_modules/.cache/vitest-native` keyed by a
  manifest of the files it was built from — a reinstalled or patched React Native
  rebuilds it rather than serving stale code.

  Measured on this repository's native suite: aggregate import time 8.8s → 1.9s
  (4.6×), wall clock 1.81s → 1.05s.

  Semantics are unchanged by design. Module identity is preserved, so React Native's
  singletons behave exactly as before and a deep `react-native/Libraries/...` require
  from an ecosystem package resolves to the same instance the app sees. Laziness is
  preserved, so a test that touches `View` and `StyleSheet` still does not execute the
  rest of React Native. Anything the registry cannot serve — a computed require, a
  module outside the entry graph, a package listed in `transform` — falls through to
  the per-file loader hooks, and a registry that cannot be built leaves the engine
  running exactly as it did before.

- ac70dec: `vi.mock('react-native')` now works under the native engine

  React Native runs in Node's module graph under `engine: 'native'`, which put it
  outside Vitest's module registry — so `vi.mock('react-native', …)`, the single most
  common thing an existing Jest suite does, silently had no effect. It was the most
  frequently hit blocker when moving a real suite over.

  The app and test graph now import React Native through a facade module the plugin
  serves. The facade re-exports the same instances Node's graph holds, so React
  Native's behaviour and object identity are unchanged — an externalized library and
  your test still see the very same `Dimensions`, `Platform`, and `StyleSheet`. What
  changes is that Vitest owns the module id, which is what lets it intercept:

  ```ts
  vi.mock("react-native", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react-native")>()),
    Alert: { alert: vi.fn() },
  }));
  ```

  `importOriginal()` returns real React Native, everything left unmocked stays real,
  and components still render React Native's own host components (`RCTView`, not a
  stand-in).

  One limit worth knowing: the interception covers modules in your project's graph —
  your app and test code. A third-party package that Vitest externalizes resolves
  React Native through Node and will still see the unmocked module. Add such a package
  to `transform: [...]` if its view of React Native needs to be mocked too.

- ac70dec: Support Vitest 5

  The peer range widens from `>=4 <5` to `>=4 <6`. Nothing in the package needed to
  change for it: the native engine, the mock engine, the precompiled React Native
  registry, the `react-native` facade, and the hot runtime all run unmodified on Vitest
  5, including its `@experimental` worker API.

  The claim is backed the same way the Vitest 4 support is. The CI matrix gains a
  Vitest 5 column — run against the oldest and newest supported React Native, since it
  varies the runner rather than RN — and it is blocking, because a declared peer range
  is a promise about every release inside it. Each cell runs the native suite stock and
  hot plus the mock-vs-real-RN cross-check, exactly as the Vitest 4 columns do.

  While 5.x is still prerelease it is reachable only through its `beta` tag; the
  repository's install-age policy still applies, so CI resolves the newest beta at least
  a week old rather than whatever published that day.

- 2d07b7a: Add a built-in `react-native-worklets` preset (auto-detected). Worklets is Reanimated's low-level runtime and is also imported directly by apps (e.g. `import { scheduleOnUI } from 'react-native-worklets'`). It ships a Jest mock at `react-native-worklets/lib/module/mock` that is ESM ending in `module.exports = …`; under the native engine React Native and its ecosystem are externalized, so requiring that file through Node throws `module is not defined in ES module scope` and takes down the whole test file. The preset shadows the package with a self-contained mock modelled on worklets' own `mock.js` API (schedulers run their worklet synchronously, matching the Reanimated preset), so worklets-using suites load and render without a hand-written mock.

### Patch Changes

- e49168e: Bound hot-runtime memory by default. When `hotRuntime` is enabled on the native engine and neither `memoryLimit` nor `recycleAfterFiles` is configured, a default per-worker memory ceiling of `clamp(totalmem * 0.25, 768MB, 1.5GB)` is now applied. Hot workers keep React Native resident and accumulate roughly 4 MB per file, so without a bound a long suite could grow toward OOM; the default lets multi-worker runs recycle a worker once it crosses the ceiling, keeping total memory bounded out of the box.

  An explicit `memoryLimit` or `recycleAfterFiles` is respected unchanged. Single-worker hot still cannot recycle (Vitest batches all files into one scheduler task), so the bound is inert there and the existing one-time "recycling INACTIVE" warning advises running with `maxWorkers >= 2`.

- 0d38401: Fix two `mock` engine divergences from real React Native, found by the behavioral cross-check:

  - `Pressable` now resolves function `style` and `children` (`({ pressed }) => …`) against its press state, matching real RN's resting render and updating while pressed. Previously the functions were passed through untouched, so the style was never applied and function children never rendered.
  - `processColor()` returns `undefined` for an unparseable color (matching real RN's normalizer) instead of coercing to opaque black.

  Also publishes the cross-check as a generated, drift-guarded fidelity report — a live badge and a docs page listing the full corpus and what is deliberately left ungated — and expands the corpus to 75 probes.

- 6c29566: Expand the "Migrating from Jest" guide with the empirically-derived limits of a real migration: a "Known limits" section covering assertions coupled to Jest's RN mock internals that don't port under a real-RN engine (`jest.spyOn(View.prototype, …)`, mocks of RN internal submodules, raw `source`-shape assertions, `jest.mock` nested in callbacks), an Expo-core caveat, and concrete guidance for the `transformIgnorePatterns` → `transform` allowlist (including the JSX-in-`.js` third-party-lib parse error and its fix).
- ac70dec: Narrow the mock engine's Flow-strip, and stop `migrate` opting packages out of auto-compilation

  **Flow-strip targeting.** The mock engine compiles React Native ecosystem packages
  pulled into the Vite graph, selected by testing for `react-native` anywhere in the
  file's path. That also matched every dependency of a project in a directory called
  `react-native-app`, and packages like `eslint-plugin-react-native` — running a Flow
  parser over files with nothing to do with React Native. It now matches the package
  name after `node_modules`: a name beginning with `react-native` (scoped or not, so
  `@shopify/react-native-skia` counts) or a scope beginning with `@react-native`.
  Everything the substring test legitimately caught is still caught, and nothing else
  is.

  **`npx vitest-native migrate`.** It translated Jest's `transformIgnorePatterns` into
  `transform: [...]` entries for packages the engine now detects and compiles by itself.
  That was worse than redundant: an explicit `transform` entry takes precedence, so the
  suggested config would have opted those packages back out of inlining, losing
  `vi.mock` support for no gain. Packages declaring `react-native` are now reported as
  already handled.

  Also adds a test that the plugin's virtual `react-native` module exports exactly what
  the mock provides — the two lists were in step, but only by hand.

- f6c4c5b: Provide `SourceCode.getConstants().scriptURL` at the native boundary. RN's `getDevServer` (`Libraries/Core/Devtools/getDevServer.js`) reads `scriptURL` and calls `.match()` on it; under the native engine the value was `undefined`, so `getDevServer` threw and took down any test whose module graph reached it. The boundary now returns a `file://` (bundled) URL for the `SourceCode` native module. It is deliberately not an `http(s)` URL: `getDevServer` only treats `http(s)` script URLs as a live dev server, so a `file://` value keeps `bundleLoadedFromServer` false — tests run as if loaded from a bundle rather than a Metro dev server, which prevents RN internals and third-party SDKs from believing they're connected to a packager and attempting real network I/O against `localhost:8081`. This mirrors the intent of RN's own Jest mock (which keeps that flag off).
- ac70dec: Explain why `engine: 'native'` cannot run on a VM pool

  Now that a configured `pool` is respected rather than overridden, `vmThreads` and
  `vmForks` reach the native engine — where they cannot work. VM pools execute test code
  in a `vm` context whose module executor bypasses Node's loader, and `module.register()`
  (how the engine installs the ESM hook that Flow-strips React Native and resolves its
  platform files) throws there outright. The failure surfaced far from its cause, as
  `Platform.OS` being undefined deep inside `NativeEventEmitter`.

  The plugin now refuses at config time and names the alternatives: `threads` (the
  default), `forks`, or `engine: 'mock'`, which needs no hooks.

- ac70dec: Stop overriding a configured `pool`, and refuse a mismatched Vitest instead of reporting nothing

  Two fixes to the native engine's pool handling.

  **A configured `pool` is no longer discarded.** A plugin's `config()` result is merged
  over the user's config, and the native engine returned `pool: 'threads'`
  unconditionally — so a project asking for `forks`, `vmThreads`, or its own custom pool
  silently got `threads`, with no warning and no way to tell from the outside. `threads`
  is now only a default, applied when no pool was configured. (`hotRuntime` still
  supplies its own pool, since opting into it _is_ choosing one, and now warns when that
  overrides a configured pool.)

  **`hotRuntime` now fails loudly when its worker would load a different Vitest.** The
  hot worker entry ships inside vitest-native, so its `import 'vitest/worker'` resolves
  from this package's location rather than the project's. Where a monorepo has more than
  one Vitest install — a linked package, a hoisted `node_modules`, mixed versions across
  workspaces — the worker and the host end up on different installations. Nothing about
  that was visible: the start handshake succeeded, the run request was accepted, no
  result was ever reported, and Vitest printed "No test files found" with no error at
  all. The pool now compares the two resolved paths at config time and throws, naming
  both, rather than letting a run pass having tested nothing.

- ac70dec: Resolve React Native package entries the way Metro does

  Both engines set `resolve.conditions: ['react-native']`, which governs Vite's _client_
  environment. Vitest runs tests in the **ssr** environment, which keeps its own list —
  Vite drops both `conditions` and `mainFields` when deriving it — so neither was ever
  applied to anything a test imported.

  Any package shipping a distinct React Native build behind that condition therefore
  loaded its web build instead:

  ```jsonc
  "exports": { ".": { "react-native": "./native.js", "default": "./web.js" } }
  ```

  The same held for the legacy mechanism, still used by packages published before
  `exports`:

  ```jsonc
  "main": "./web.js", "react-native": "./native.js"
  ```

  Metro resolves both ahead of the standard fields, so tests were exercising code the
  app never runs, with nothing to indicate it. Both are now set for the ssr environment
  as well as the client one, under both engines, with a regression test each.

  `browser` is deliberately not added to `mainFields` even though Metro lists it: under
  Node it would pull the web build of any package that has a browser field and no
  react-native one.

  **Upgrade note.** The `react-native` field is honoured wherever it appears, not only
  on React Native libraries — Algolia's clients, `nanoid` and `msgpackr` all ship one,
  usually pointing at a browser or ESM build. Metro resolves those the same way, so this
  is the build the app actually runs, but a dependency may now load a different file
  than it did before. If that is a problem for one package, `transform: ['the-package']`
  or an explicit `resolve.alias` pins it.

- ac70dec: Fix a stale-registry hazard and restore React Native's stack frames

  Two defects in the precompiled registry, both found by reviewing it adversarially
  rather than by a failing test.

  **The cache key ignored the boundary mocks' content.** It hashed their module _names_,
  but the mocks are compiled into the registry, so changing one — a maintainer editing a
  mock, or a user upgrading to a release that changed one — left the cached registry
  valid and kept serving the previous behaviour with nothing to indicate it. The key now
  hashes the rendered mock source, and this package's own version alongside it, covering
  everything else it contributes.

  **Stack frames from inside React Native lost their file.** Collapsing ~440 modules
  into one file meant an RN-internal failure reported
  `registry/rn-ios-<hash>.cjs:253:7638` instead of
  `Libraries/Animated/nodes/AnimatedInterpolation.js` — the useful part of the frame.
  The registry now emits a source map attributing every generated line to the React
  Native file it came from, and enables Node's source-map support before compiling
  itself. Failure output names real React Native files again, at no runtime cost.

  Also relaxes the `hotRuntime` Vitest guard added alongside it: it compared resolved
  paths, so a monorepo with the same Vitest version installed in two trees was refused
  even though those interoperate fine. Only a version difference is an error now.

- 4c567c1: Make native-engine turboStubs identity-stable and spy-able. Unmocked native modules were served by a Proxy that minted a fresh stub object on every property access and whose get trap never consulted the target — so `NativeModules.Foo !== NativeModules.Foo`, and `vi.spyOn(NativeModules.Foo, 'method')` silently recorded nothing (the spy landed on a throwaway object). Stubs are now memoized per module name in the shared boundary state (`NativeModules.Foo === TurboModuleRegistry.get('Foo')`, matching bridgeless RN), methods are memoized on first read, and explicitly-set properties win — so spies record and restore correctly. A `has` trap reports all properties present, consistent with the get trap's serve-anything behavior, which `vi.spyOn`'s existence check requires. Under the hot runtime, per-file overrides (spies, memoized methods) are cleared between files via the surgical-reset registry while stub identity is preserved for resident libraries holding references.
- 57f155d: Fix three silent resolution-fidelity gaps around deep (subpath) imports.

  - **`react-native` subpath default exports are now the leaf module.** `import Platform from 'react-native/Libraries/Utilities/Platform'` previously received the entire mock object as `Platform`, so `Platform.OS` was silently `undefined`. The virtual subpath modules (ESM) and the CJS bridge now derive the intended export from the subpath's basename and serve it as the default — CJS requires get Babel-interop shape (`{ __esModule, default }` via a live wrapper) so both `require('.../Platform').OS` and `_interopRequireDefault(...)` consumers work. Unknown leaves keep the previous whole-mock fallback.
  - **`react-native/package.json` (and preset `pkg/package.json`) resolve to the real manifest.** Version gates like `require('react-native/package.json').version` previously read the mock and got `undefined`. Both the Vite-graph and CJS-bridge interception now exempt the manifest; when the package is not installed, the previous mock fallback is kept rather than erroring.
  - **Preset shadowing now covers subpath imports.** `import Swipeable from 'react-native-gesture-handler/Swipeable'` (and CJS equivalents, including requires nested inside externalized third-party libraries) previously bypassed the preset mock entirely and loaded the package's real native-runtime code — or failed resolution outright on package versions that no longer ship the deep file. All three redirect layers (Vite plugin, ESM loader hook, CJS require hook) now match subpaths of preset packages and serve the mock export named by the subpath's leaf, falling back to the root mock. JSON and asset-extension subpaths are exempt so manifests and font/image files keep resolving from disk. CJS interop wrappers are memoized per specifier (keyed by the live mock set, so hot-runtime per-file rebuilds stay correct) to keep module identity stable across repeated requires.

- 3b1c396: Native-engine transform cache rework: project-local, content-keyed, lazy Babel.

  - **The transform disk cache moves from `os.tmpdir()` to the project's `node_modules/.cache/vitest-native/`** (tmpdir fallback when node_modules is absent or unwritable). tmpdir is ephemeral on CI runners — every job paid a full cold Babel transform of React Native's ~250-file boot graph — and macOS purges it periodically. The new location persists across runs and is restorable by standard CI dependency-cache actions. The V8 compile cache is colocated.
  - **Disk entries are keyed by content hash (platform + path + source), not mtime + size.** Content keys survive fresh installs, Docker mtime normalization, and CI cache restores — and eliminate the stale-hit class where a same-size, same-mtime file with different content served wrong executable code. The path stays in the key because Babel's output embeds the filename (`_jsxFileName` in transformed JSX), so identical sources at different paths must not share an entry; restores are valid wherever the checkout path is stable, which CI workspaces are. The cache directory name now also carries the `@babel/core` version alongside the preset version, so a Babel upgrade invalidates cleanly.
  - **`@babel/core` loads lazily, only on a cache miss.** Loading Babel costs ~35ms vs ~0.5ms for the resolve-only version check, and under the default engine every isolated worker paid it even when every file came from the disk cache. Measured on the package's own native suite (warm cache): aggregate worker setup down ~30%, wall clock ~11% — the effect scales with test-file count.

- ac70dec: Match `transform: [...]` packages by their real location, not by name anywhere in the path

  The pattern behind `transform` tested for `/<package-name>/` anywhere in a file's
  path, so any **directory** sharing a package's name was treated as that package. A
  project folder called `expo`, or a source directory named after the library it
  implements, made every file beneath it get compiled and externalized as third-party
  source — including, in one case, this package's own runtime, which then failed with
  `Vitest cannot be imported in a CommonJS module using require()`.

  A file now matches only if it is inside the package's resolved directory, or under
  `node_modules/<name>/`. Both rules are needed: the resolved directory covers workspace
  and `file:` dependencies, which resolve to a real path with no `node_modules` segment,
  while the `node_modules` rule covers additional copies of a package that a single
  resolution cannot see.

- 091a572: Three hardening fixes:

  - **Prerelease peer versions no longer fail validation.** A prerelease sharing the minimum's major.minor (e.g. vitest `4.0.0-beta.3` against the `4.0.0` floor) parsed with `NaN` in the patch slot, failed the minimum check, and hard-errored at startup for installs running betas/RCs. Prerelease/build metadata is now stripped before comparison; a prerelease of the minimum itself is accepted.
  - **Mock-engine asset stubs match the native loader's semantics.** The extension match is now case-insensitive (`LOGO.PNG` stubs like `logo.png`), user-supplied `assetExts` entries are regex-escaped, and the stubbed basename is JSON-stringified so filenames containing quotes emit valid JS.
  - **The mock engine's Flow-strip transform skips unparseable files instead of throwing.** The `@flow` filter is a heuristic — the marker can appear inside a string or comment of a file `flow-remove-types` then fails to parse; that parse error previously took down the whole transform pipeline.

- ac70dec: Fix `importOriginal()` inside a test's own `vi.mock('react-native')` under the mock engine

  A test that registered its own `vi.mock('react-native', …)` replaced the registration
  the setup file makes, and the factory's `importOriginal()` then resolved to an empty
  module. The near-universal spread-and-override form therefore dropped every export
  the test did not name:

  ```ts
  vi.mock("react-native", async (importOriginal) => ({
    ...(await importOriginal()), // was empty
    Alert: { alert: vi.fn() },
  }));
  // -> No "Platform" export is defined on the "react-native" mock
  ```

  The virtual `react-native` module now re-exports the runtime mock, so
  `importOriginal()` returns the full surface and unnamed exports survive.

- ac70dec: Stop the hot runtime's legacy-runner import from breaking on Vitest 5

  `hotRuntime`'s test runner imported `vitest/runners` as a fallback for Vitest 4.0.x,
  guarded by a runtime check. The guard does not help: a literal specifier is resolved
  when the module is transformed, not when the branch runs. Vitest 5 removed that
  subpath, so the resolve failed on every test file — and the failure mode was the worst
  kind, reporting unhandled errors, running no tests, and still exiting 0.

  The fallback specifier is now computed, so it stays invisible to the resolver: Vitest
  4.0.x keeps its fallback and Vitest 5 never looks for it.

- a756f6a: Make `jest.requireActual('react-native')` return a writable facade. Jest suites commonly clone-and-override React Native — `const RN = jest.requireActual('react-native'); RN.Platform = {...}; return RN`. Under the native engine RN's index is a facade of lazy getters with no setters, so assigning to it threw `Cannot set property … which has only a getter` and failed to load the whole test file. `requireActual('react-native')` now returns a write-through proxy: reads fall through to the real (lazy) facade, and assignments are captured so the override wins on later reads — matching Jest's mutable module. Only `react-native` is wrapped; its submodules and other packages are ordinary mutable CommonJS.

## 0.8.0

### Minor Changes

- 067e2aa: Add built-in presets for `@shopify/flash-list`, `@gorhom/bottom-sheet`, and `react-native-keyboard-controller`.

  These libraries rely on native runtimes (a native recycler, reanimated worklets, and keyboard native modules) that cannot run under Node, so before this they had to be mocked by hand. Each is now auto-detected when installed and shadowed by a self-contained preset under both engines: `FlashList` renders its data through `renderItem` so rows stay queryable, the bottom-sheet containers render their children through real React Native with no-op imperative refs, and the keyboard-controller containers render their children while `KeyboardController` and the reanimated-backed hooks return inert handles.

- b31e3d9: Support `@testing-library/react-native` 14 alongside 12 and 13.

  RNTL 14 made `render`, `fireEvent`, and `act` asynchronous and reconciles with the new
  `test-renderer` (replacing `react-test-renderer`). Two changes make the native engine work
  across the full supported peer range (`>=12 <15`) from a single setup:

  - Register `RCTVirtualText` as a text host under the native engine. Real React Native renders a
    nested `<Text>` as the host `RCTVirtualText`, which RNTL 14's `test-renderer` did not recognize
    as text — so any composite or nested `<Text>` threw "Text strings must be rendered within a
    `<Text>` component". Nested and composite text now render and match correctly.
  - The engine itself is RNTL-version agnostic; the only caller-visible difference is that RNTL 14's
    `render`/`fireEvent`/`act` must be awaited. Awaiting them is back-compatible with RNTL 12/13,
    where the calls are synchronous.

  CI now exercises RNTL 12, 13, and 14. Note that RNTL 14 requires Node >= 22.13; on Node 20, use
  RNTL 13.

### Patch Changes

- 489a536: Scope React Native path detection to `node_modules`. The native engine identified
  React Native package files with the regex `/[\\/]react-native[\\/]/`, which also
  matched any project checked out under a directory named `react-native` (for example
  `/home/runner/work/react-native/react-native/` in CI for a repo named `react-native`).
  Every project file then matched, so `.tsx` test files were externalized and sent raw
  to Node (`Unknown file extension ".tsx"`) and `vi.mock()` calls stopped hoisting.
  The matchers in `apply.ts`, `loader.mjs`, and `hooks.mjs` now require a
  `node_modules/` segment, which still matches real RN and `@react-native/*` packages
  (including pnpm-nested layouts) without false-matching project paths. Reported and fixed
  by [@Doko-Demo-Doa](https://github.com/Doko-Demo-Doa) (#50).
- 5eaf8cb: Cache the React Native graph's compiled bytecode under the native engine.

  With per-file isolation (`engine: 'native'`, the default), React Native's module graph is re-instantiated for every test file, recompiling its source to V8 bytecode each time. The native engine now enables Node's on-disk compile cache (Node 22.8+) before React Native is loaded, so subsequent compilations across files, workers, and runs reuse cached bytecode. Measured on a 100-file suite (single worker), this reduced cold time by ~7% and warm time by ~7-18% with tighter run-to-run variance and no change in memory use. It is a no-op on Node versions without the compile-cache API.

## 0.7.0

### Minor Changes

- 37c8123: Native engine: Metro-style resolution for externalized node_modules packages, plus navigation route params and jest-compat timer leniency

  Vitest externalizes most `node_modules` dependencies (any that Node can import
  natively), so they load through Node rather than Vite — and Node's resolver has no
  notion of React Native's Metro conventions. The native engine now fills those gaps
  for externalized packages:

  - **Platform extensions** — `import './x'` resolves `x.native.js` / `x.ios.js` /
    `x.android.js` over the default `x.js`, for any `node_modules` package (matching
    Metro and Vite's behavior for inlined code). Previously only `react-native` and
    packages in `transform` got this, so e.g. `@react-navigation` silently loaded its
    web variant (`useLinking.js`), breaking the navigation lifecycle with no error.
  - **Asset imports** — `import icon from './icon.png'` (and other asset extensions)
    resolve to the basename string instead of throwing "Unknown file extension" in
    Node's ESM loader.
  - **JSON imports** — `import data from './data.json'` without a `with { type: 'json' }`
    attribute no longer throws `ERR_IMPORT_ATTRIBUTE_MISSING` on Node 22+. The native
    engine injects the attribute so Node's own JSON module loader handles it.

  Other changes:

  - **`navigation` preset** accepts `defaultRouteParams`, used by the mocked
    `useRoute().params` (and as a `<Screen>`'s fallback params) — so components that
    read route params at mount can be tested without a custom `vi.mock`.
  - **jest-compat** `jest.advanceTimersByTime` / `advanceTimersByTimeAsync` are now
    no-ops when fake timers are inactive, matching Jest's lenient behavior (Vitest's
    `vi` throws). This fixes RNTL `userEvent.setup({ advanceTimers })` on suites that
    never enable fake timers. All other `jest` methods continue to forward to `vi`.

### Patch Changes

- 5a86872: Add mocks for react-native 0.86 top-level exports

  The weekly compatibility check flagged new stable exports in react-native 0.86.
  `EventEmitter`, `useAnimatedColor`, and `useAnimatedValueXY` are now mocked so
  named imports resolve under the mock engine. The experimental virtualized-collection
  API (`unstable_VirtualRow`, `unstable_createVirtualCollectionView`, and related)
  is added to the compatibility check's known-skipped list.

## 0.6.1

### Patch Changes

- 40a5147: Native engine: fix `import { Appearance } from 'react-native'` (and other lazy-getter RN exports) failing with "does not provide an export named …" when the import comes from an **externalized ESM dependency**.

  React Native's index exposes everything via lazy getters (`module.exports = { get Appearance() {…} }`), which `cjs-module-lexer` can't surface as named exports when Node imports the CommonJS module from the ESM graph. The Node ESM loader now serves RN's main index as a thin re-export of the real (Flow-stripped) module plus a `cjs-module-lexer`-recognized export hint, so named imports resolve while the real getters stay lazy (no eager load of RN's surface). The `require('react-native')` path is unchanged.

  Previously this needed a manual `transform: ['the-lib']` workaround (e.g. for `uniwind`); that's no longer required. Surfaced by the obytes-template bake-off.

## 0.6.0

### Minor Changes

- 3297e5b: Add a built-in `vectorIcons` preset for `@react-native-vector-icons` (v10+),
  auto-detected like the other third-party presets.

  The library's v10 icon sets (`@react-native-vector-icons/material-icons`, …) are
  all built on the shared `@react-native-vector-icons/common` module, whose dynamic
  font loader runs at import time and queries the native `ExpoFontLoader` — which
  cannot exist in Node. Without shadowing, importing any icon set throws and the set
  is wrongly reported "not available", so icons render nothing. The preset shadows
  the single `common` module (the way jest mocks vector-icons) so `createIconSet(...)`
  returns a lightweight Text-based stub that forwards `name`/`size`/`color`/`style`/
  `testID` — fixing every icon set at once. The legacy `react-native-vector-icons`
  package is mapped to the same preset.

  Surfaced by the `@rneui/base` bake-off, where every `Icon` test failure traced to
  this import-time crash.

### Patch Changes

- e333954: Fix two `Animated` mock fidelity gaps surfaced by the mock-vs-real-RN cross-check:

  - `Animated.Text` (and the other `Animated.*` components) now render the base host
    component (`Text`, `View`, …) instead of a host literally named `Animated.Text`,
    so RNTL's `getByText`/`queryByText` can find their text children — matching real
    React Native.
  - An `Animated.Value` (or interpolation/color node) used in a `style` prop now
    resolves to its current value on the host's style, so assertions like
    `toHaveStyle({ opacity: 0.3 })` against `new Animated.Value(0.3)` pass — matching
    how real React Native writes the live value onto the host.

- Restore Vitest 4.0.x compatibility in the hot-runtime runner. 0.5.0 imported `TestRunner` from the `vitest` main entry, which only exists in 4.1+; on 4.0.x the hot runner threw `Class extends value undefined`. It now prefers the main-entry export and falls back to the (deprecated) `vitest/runners` subpath only when the main export is absent — so 4.1+ stays warning-free and 4.0.x works again.
- 3297e5b: Native engine: stub asset `require()`s reaching Node's CJS loader. A literal
  `const img = require('./logo.png')` or `require('./Icon.ttf')` (common in real RN
  components) escapes Vite's asset handling and hits Node's loader, where the binary
  was compiled as JS and threw `SyntaxError: Invalid or unexpected token`, taking
  down the whole test file. The Node require-hook now stubs asset extensions
  (images, media, and fonts) to their basename string, matching the Vite graph and
  Metro/Jest behaviour.

  Surfaced by a real bake-off of the `@rneui/base` (react-native-elements) Jest +
  RNTL suite under the native engine.

## 0.5.0

### Native engine

- Propagate the configured iOS/Android platform through native resolution,
  transformation caches, Babel caller metadata, and native boundary constants.
- Bring assets, helper controls, native-module injection, animated matchers, and
  snapshot serialization to the native engine contract.
- Reject mock-only `mocks` overrides under the native engine instead of silently
  ignoring them.

### Mock engine

- Block `onPress` on disabled `Pressable`/`Touchable*`/`Button` under
  `@testing-library/react-native` v14. RNTL 14 resolves press handlers by walking
  the composite fiber, which re-finds `onPress` on the wrapping `forwardRef` mock,
  so the earlier host-prop stripping no longer blocked the press; disabled hosts
  are now marked `pointerEvents: "none"` so RNTL's `isEventEnabled` rejects it
  (no-op under RNTL ≤13). Thanks @jakeboone02.
- Stop passing the `hostComponentNames` option to `configure()` on RNTL ≥14,
  which removed it in favor of auto-detection; this silences an "Unknown
  option(s) passed to configure" warning while preserving the option for
  RNTL ≤13.

### Reliability

- Fix hot-runtime cross-file leaks from import-time globals, direct environment
  mutations, and app-owned RN event listeners.
- Add a dedicated one-worker hot-isolation gate, a generated 100-file soak,
  end-to-end memory-triggered worker recycling, and Android platform-resolution
  coverage.
- Validate plugin and hot-runtime options eagerly with actionable errors.
- Fail configuration for unsupported required Vite, Vitest, and React peers
  instead of continuing after a console error.

### Compatibility and release engineering

- Validate packed release tarballs in bare RN 0.83/RNTL 12, Expo 56/RNTL 13,
  Vite 8 monorepo/RNTL 14, RN 0.86 Android, and a mock-engine RNTL 14 consumer
  (the combination that guards the disabled-press fix above).
- Support Vite 8's Oxc JSX configuration without the deprecated `esbuild`
  option, while retaining Vite 6–7 support.
- Load RNTL matchers across the public, `build`, and `dist` layouts used by
  RNTL 12–14, and expose Vitest's `expect` for RNTL matcher registration without
  enabling all Vitest globals.
- Upgrade the validated baseline to Vitest 4.1.8, RN 0.85.3, and React 19.2,
  with exact peer upper bounds for unsupported future majors.
- Require patched Vite floors (^6.4.2, ^7.3.2, or ^8.0.5) and refresh build
  tooling/transitive resolutions to remove known high-severity advisories.
- Make Linux Node 20/22, macOS, Windows, packed consumers, the example app,
  soak tests, cross-checks, and package export analysis blocking release gates.

## 0.4.1

### Patch Changes

Documentation fixes (the README is consumers' primary reference):

- **Quick Start now runs as written.** It used bare `test()`/`expect()` with no
  import, but the plugin does not enable Vitest globals — copying it produced
  `test is not defined`. Added the `import { test, expect } from 'vitest'` and a
  note on the `globals: true` alternative.
- **Installation** notes the companion dependencies the examples need
  (`@testing-library/react-native`; a real RN app already provides `react-native`
  - `@react-native/babel-preset` + `@babel/core`).
- Corrected the RN-conformance count (118 ported: 115 passing, 3 documented skips).
- "Spiritual successor" → "Maintained successor" wording, with a migration link.

## 0.4.0

**The native engine is now the zero-config default.** `reactNative()` with no
options runs your tests against **real React Native** — the same JavaScript that
ships in your app — mocking only the native-module boundary. The pure-JS mock
engine remains as an explicit opt-in (`engine: 'mock'`). vitest-native positions
itself as the maintained continuation of
[`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native).

> Beta. The native engine is validated against real apps (react-native-paper, the
> obytes template, Rocket.Chat) across React Native 0.81–0.84, with a CI-gated
> behavioral cross-check against real RN. Some APIs may still shift before 1.0.

### Breaking Changes

- **`engine: 'auto'` (the default) now resolves to `'native'`** whenever
  `@react-native/babel-preset` and `@babel/core` are present — i.e. in any real RN
  app. It falls back to `'mock'` only when those deps are absent, printing one line
  to explain why. Previously `auto` always resolved to `mock`. Set
  `engine: 'mock'` to keep the old behavior.

### Native engine

- **Boundary hardening.** The native-module stub now honors RN's calling
  conventions it previously broke: callback-style methods invoke the success
  callback instead of hanging (fixes `AccessibilityInfo.*`, `Share.share`), and
  promise-returning methods return a real `Promise` (fixes `Linking.canOpenURL`/
  `openURL`, `Image.prefetch`/`getSize`). Backed by app-shaped stress suites
  (`tests-native/stress*.test.tsx`) as a permanent regression gate.
- **`isolate: true` is the native-engine default** — the safe Vitest default.
  Adversarial testing proved `isolate: false` leaks state across files at scale.
  An opt-in **hot runtime** (`reactNative({ hotRuntime: true })`) reclaims the
  speed safely via surgical per-file reset, for large suites.
- **`transform` allowlist** — extra `node_modules` packages whose untranspiled
  source the native engine should strip (Flow/TS/JSX) as it loads them, for
  third-party RN libraries (analogous to Jest's `transformIgnorePatterns`).
- **Presets apply under the native engine**, shadowing each library's native
  runtime (worklets, native modules) the way Jest does — including transitively
  imported presets — while the surrounding tree renders through real RN.
- **Expo**: the `expo` preset shadows the common Expo modules under the native
  engine (gated proof in `tests-native/expo.test.tsx`).

### Trust & tooling

- **Cross-check** — a CI-gated behavioral differential that runs the same probes
  under `mock` and `native` and diffs them against real RN as the oracle. It is
  how mock fidelity is proven (and it found two of the mock fixes below).
- **Vitest × RN CI matrix** — gates the native engine across RN 0.81–0.84 ×
  Vitest {pinned, latest}, with the latest-Vitest column as a non-blocking canary.
- **Jest migration tooling** — a `vitest-native/jest-compat` entry (the `jest`
  global, `@jest/globals`, jest-native extend-expect) plus auto-hoisting of
  top-level `jest.mock` → `vi.mock` and automatic JSX runtime. Guides:
  `docs/migrating-from-jest.md` and `docs/migrating-from-vitest-react-native.md`.

### Presets & matchers

- `react-native-gesture-handler` preset now exports `Pressable` (mirroring RN's,
  including suppressing press handlers when `disabled`).
- `toHaveAnimatedStyle` / `toHaveAnimatedProps` are auto-registered on `expect()`,
  replacing reanimated's Jest-only `setUpTests()` matchers. Opt into types with
  `"types": ["vitest-native/matchers"]`.
- New presets: `react-native-device-info`, `react-native-mmkv`, `react-native-svg`,
  `react-native-webview`; navigation preset covers drawer/bottom-tabs/elements.

### Mock-engine fidelity fixes

- Disabled `Pressable`/`Touchable` mocks now suppress press handlers.
- `StyleSheet.hairlineWidth` is derived from the pixel ratio (≈`1/3` at scale 3)
  instead of a hardcoded `0.5`, matching real RN.
- `Animated.Value.interpolate()` supports string output ranges (e.g.
  `["0deg", "360deg"]`, `["0%", "100%"]`), preserving the unit/suffix.

## 0.3.0

### Minor Changes

- Add RN conformance test suite — 75 tests ported from React Native's own test suite (Animated, processColor, flattenStyle, Interpolation) to validate mock behavioral parity
- Add Animated orchestration: `sequence` chains via callbacks, `parallel` waits for all, `loop` supports finite/indefinite iterations with `resetBeforeIteration`
- Add Animated value tracking: `timing`/`spring` with an `AnimatedValue` as `toValue` track source changes via listener
- Add Animated.Color, diffClamp tracking, interpolation extrapolate/easing, toJSON support
- Expand reanimated preset: 44 entering/exiting animations, 7 layout transitions, `useAnimatedReaction`, `useAnimatedKeyboard`, `useReducedMotion`, `useFrameCallback`, `makeMutable`, `SharedTransition`, `ReduceMotion`/`KeyboardState` enums
- Add `@react-navigation/drawer` preset with `createDrawerNavigator`
- Add `setInsets()` helper for safe area context testing
- Add inter-test isolation: `resetAllMocks()` now resets AsyncStorage store and safe area insets
- 1136 tests passing across 30 files

## 0.2.1

### Patch Changes

- Add missing `@react-navigation/core` re-exports to navigation preset, including `useNavigationContainerRef`, `useTheme`, `ThemeProvider`, `NavigationIndependentTree`, `useNavigationBuilder`, `BaseRouter`, and 20+ other exports. Fixes tests that depend on these being available from `@react-navigation/native`.

## 0.2.0

### Minor Changes

- Add Metro-compatible extensionless module resolution for node_modules. Add navigation preset mocks for @react-navigation/native-stack, @react-navigation/bottom-tabs, and @react-navigation/elements. Support custom presets.

## 0.1.3

### Patch Changes

- 260ae84: Fix package metadata: correct GitHub URLs and Node >= 20 engine requirement.
