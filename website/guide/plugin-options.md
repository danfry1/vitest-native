# Plugin Options

All options are optional. `reactNative()` with no arguments works for any real RN app.

```ts
reactNative({
  engine: 'auto',        // 'native' | 'mock' | 'auto' (default: 'auto' → native when available)
  platform: 'ios',       // 'ios' | 'android' (default: 'ios')
  diagnostics: false,    // Log plugin activity (default: false)
  mocks: {},             // Custom mock overrides
  assetExts: [],         // Additional asset extensions (e.g. ['.lottie', '.m4b'])
  transform: [],         // Extra node_modules packages to transform (Flow/TS/JSX), native engine
  hotRuntime: false,     // Per-file isolation (default); 'auto' opts in to the hot runtime
  nativeModules: 'device', // 'device' | 'permissive' — how native module lookups answer, native engine
  registryBuild: 'background', // 'background' | 'wait' — a cold registry build, native engine
  // presets — omitted on purpose: leaving it out auto-detects your installed
  // libraries. Passing an array uses ONLY that array, so `presets: []` means none.
})
```

## `engine`

**Type:** `'auto' | 'mock' | 'native'` · **Default:** `'auto'` · **Engine:** both

Which engine to use. See [Choosing an Engine](/guide/engines) for the full breakdown.

- `'auto'` *(default)* — native when a React Native Babel preset (`@react-native/babel-preset`, or else Expo's) + `@babel/core` are present, else mock with a one-line notice.
- `'native'` — force real React Native; mock only the native boundary.
- `'mock'` — force the fast pure-JS mock.

## `platform`

**Type:** `'ios' | 'android'` · **Default:** `'ios'` · **Engine:** both

`'ios'` (default) or `'android'`. Controls which platform-specific file extension wins during resolution (`.ios.ts` vs `.android.ts`) and the value of `Platform.OS`. To test both platforms, run them as separate Vitest projects with one plugin instance each. (Under the mock engine only, [`setPlatform`](/guide/helpers#setplatform-os) can also switch per-test at runtime; the native engine fixes the platform when the module graph loads.)

## `diagnostics`

**Type:** `boolean` · **Default:** `false` · **Engine:** both

Set to `true` to log plugin activity — useful when debugging resolution or which engine resolved. Default `false`.

To turn it on for a single run without editing the config each time, read an environment variable you choose:

```ts
reactNative({ diagnostics: process.env.RN_TEST_DEBUG === "1" });
```

```bash
RN_TEST_DEBUG=1 vitest run
```

vitest-native does not read a `VITEST_NATIVE_DIAGNOSTICS` variable. Older releases' `VITEST_NATIVE_*` settings, such as `VITEST_NATIVE_PLATFORM`, are no longer read either; set the matching option, such as `platform`. Startup warns when one is set.

## `presets`

**Type:** `(Preset | string)[] | Record<string, boolean>` · **Default:** auto-detected from installed packages (the native engine leaves Expo's packages unmocked) · **Engine:** both

An array of [third-party presets](/guide/presets). Presets are auto-detected from your installed dependencies, so listing them is usually optional:

::: warning An array replaces auto-detection
When `presets` is an **array**, only those presets are used — auto-detection does not
run. `presets: []` therefore disables every preset, including ones your app depends
on. Omit the option entirely to keep auto-detection.
:::

To keep auto-detection and switch a single preset off, pass an **object** instead:

```ts
reactNative({
  presets: { navigation: false },
})
```

That is what you want when one preset gets in the way — for example when a suite
renders a real `NavigationContainer` and the stubbed one never fires `onReady`.
Listing every other detected preset back by hand to drop one also rots silently: add
a library later and its preset is not applied, because the hand-written array does
not mention it.

```ts
import { reactNative, presets } from 'vitest-native'

reactNative({
  presets: [presets.reanimated(), presets.navigation()],
})
```

## `mocks`

**Type:** `Record<string, JSON value>` · **Default:** `{}` · **Engine:** mock

::: warning Mock engine only
`mocks` merges overrides into the mock's export table, so it only applies with `engine: 'mock'` — the native engine runs the real `react-native` module and throws a configuration error if `mocks` is set. Use `vi.mock()` in a setup file or [`mockNativeModule`](/guide/helpers#mocknativemodule-name-impl) instead.
:::

Overrides for the mock's `react-native` exports, keyed by export name. Each value replaces that export whole, so an object you pass is the entire export, not a partial update. Values must be JSON-serializable (strings, numbers, booleans, plain objects, arrays), because they are passed to the test workers; a function value, such as a component, fails with `INVALID_OPTION`:

```ts
reactNative({
  engine: 'mock',
  mocks: {
    ReactNativeVersion: { major: 0, minor: 86, patch: 0 },
  },
})
```

To supply a component or function, such as one of the handful of [unstable/private RN exports](/api/coverage#not-covered) the mock does not provide, use `vi.mock` in a setup file instead:

```ts
// vitest.setup.ts
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  unstable_NativeText: MyCustomMock,
}))
```

## `assetExts`

**Type:** `string[]` · **Default:** `[]` · **Engine:** both

Additional extensions to load as [assets](/guide/how-it-works#_2-assets) — registered with React Native's asset registry, as Metro does — beyond the built-in defaults:

```ts
reactNative({
  assetExts: ['.lottie', '.m4b'],
})
```

## `transform`

**Type:** `string[] | { include?: string[]; exclude?: string[] }` · **Default:** `[]` · **Engine:** native

Packages that declare `react-native` are compiled automatically; `transform` adjusts that set — the vitest-native equivalent of Jest's `transformIgnorePatterns`. An array (or `include`) adds packages that ship untranspiled source (Flow/TS/JSX) but aren't detected; `exclude` names packages that must never be compiled, whatever selected them:

```ts
reactNative({
  transform: ['some-untranspiled-lib'],
})

reactNative({
  transform: { include: ['some-untranspiled-lib'], exclude: ['some-build-tool'] },
})
```

A listed package's own dependencies are compiled too, as an auto-detected package's are. See [untranspiled packages](/guide/mocking#packages-that-ship-untranspiled-source).

## `projectBabel`

**Type:** `'auto' | 'always' | 'never'` · **Default:** `'auto'` · **Engine:** both

Compiles your own source with your project's Babel config where a file needs something Vite's Oxc transform does not do, as Metro and babel-jest compile it. Packages in `node_modules` are not affected.

- `'auto'`: your config decides which of its plugins matter, and each file's source decides whether it needs one. A file compiles with Babel only then; every other file keeps Oxc.
  - Examples: a file with a decorator, with legacy decorators configured (`@babel/plugin-proposal-decorators`); a macro import; an `@env` import with `react-native-dotenv`; a worklet, when Reanimated runs as its own mock; a `className` with NativeWind; a file with an `@flow` pragma.
  - A plugin vitest-native does not know applies to every file the config covers.
  - Startup names what caused it:

    ```
    [vitest-native] projectBabel: project source that needs it compiles with the project's Babel config, for @babel/plugin-proposal-decorators.
    ```

    With `diagnostics: true`, each file that compiles with Babel is named, with the reason.
- `'always'`: every project file the config applies to compiles with Babel, as under babel-jest. Slower.
- `'never'`: Oxc only.

A preset of your own that wraps React Native's or Expo's (an app preset, `@rnx-kit`'s) counts as theirs; the plugins it adds beyond them are judged one by one, like your own. Covered without Babel: React Native's and Expo's presets, `@babel/preset-typescript`, `preset-react`, `preset-flow` and `preset-env`, standard syntax plugins Oxc compiles, `babel-plugin-module-resolver` (its aliases map onto `resolve.alias`), and the worklets plugins, unless Reanimated runs as its own mock. An option that changes what a covered entry outputs, such as `loose`, `assumptions`, a JSX `pragma` or `importSource`, or Flow's `all`, counts as a plugin the files it affects need.

The output stays an ES module for Vite: module transforms (`@babel/plugin-transform-modules-commonjs` and the others, `babel-plugin-dynamic-import-node`, preset-env's `modules`) are turned off for this compile, also inside a preset that adds them itself, and `babel-plugin-istanbul` is left out. If a plugin vitest-native does not know still writes CommonJS, and it is the only thing that sent a file to Babel, that file compiles with Oxc as before, without that plugin, and one warning names it. If the file also needs something else from the config, the run fails with [`PROJECT_BABEL_COMMONJS`](/guide/errors#PROJECT_BABEL_COMMONJS), since falling back would drop what that does.

A Babel plugin in your Vite config (such as a `babel()` entry from `@rolldown/plugin-babel`) still runs its own plugins after this one. A plugin both apply, such as the worklets plugin, finds nothing left to do the second time.

Vitest's transform cache is keyed on what your config loads for each file: the plugins' versions and options, a local plugin's file, `BABEL_ENV` and `NODE_ENV`, your `.env` files when a dotenv plugin is configured, and the environment when an inline-environment plugin is. A file your config itself `require`s for other reasons is not; run with `--clearCache` after changing one.

## `hotRuntime`

**Type:** `boolean | 'auto' | object` · **Default:** `false` · **Engine:** native

Reuses test workers across files instead of starting a fresh one for each, while still giving every file fresh app and test modules, mocks and timers. It is opt-in and experimental: it uses Vitest's custom worker APIs, which Vitest labels experimental, and it has [known differences](/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files) from per-file isolation. Whether it is faster depends on the suite, so measure it on yours. See [Hot Runtime](/guide/hot-runtime).

- `false` *(default)*: each test file runs in a fresh worker.
- `'auto'`: use the hot runtime where the run can be bounded and recycled (at least two workers, no explicit pool, `test.isolate` or overriding CLI flag, and a matching Vitest install), and per-file isolation otherwise, printing why.
- `true`: require the hot runtime. Startup fails with [`HOT_MEMORY_UNBOUNDED`](/guide/errors#HOT_MEMORY_UNBOUNDED) when the run has one worker, and with [`HOT_RUNTIME_OVERRIDDEN`](/guide/errors#HOT_RUNTIME_OVERRIDDEN) when an explicit pool or `test.isolate`, a CLI flag (`--no-isolate`, `--pool`, `--maxWorkers=1`, `--no-file-parallelism`) or a `sequence.groupOrder` worker-count clash rules it out.
- An object: tune worker recycling. On its own it requires the hot runtime, as `true` does; add `mode: 'auto'` to fall back as `'auto'` does.

| Key | What it does |
|---|---|
| `mode` | `'auto'`: fall back to per-file isolation where the hot runtime cannot run, instead of failing |
| `recycleAfterFiles` | retire a worker after it has run this many test files (default off) |
| `memoryLimit` | retire a worker when its JS heap reaches this many bytes; `0` turns the threshold off; by default the memory plan picks it |
| `preserveGlobals` | exact `globalThis` property names a resident library owns, kept between files (Storybook's preview registry is kept automatically) |
| `esmGeneration` | `true` by default: re-run, for each file, the packages Node loads for a test file's `import`s (not the React Native packages vitest-native compiles), so their state does not carry over; `false` keeps them loaded |
| `allowUnboundedMemory` | permit a run where recycling cannot be enforced, such as one worker; also turns off the automatic worker cap and memory hard stop. Only when something outside the run bounds its memory. Not with `mode: 'auto'` |

```ts
reactNative({ hotRuntime: 'auto' })
reactNative({ hotRuntime: { mode: 'auto', memoryLimit: 2 * 1024 ** 3 } })
```

The worker count and memory limits come from a plan derived from the host or container's memory. It caps the worker count it picks itself at four; a `maxWorkers` you set is capped only by memory. See [workers and memory](/guide/hot-runtime#workers-and-memory).

## `experimental`

**Type:** `{ nodeMocks?: boolean; ownershipModel?: 'resolver' | 'resolution' }` · **Default:** `{}` · **Engine:** native

Behaviour that is not the default yet. Each setting is decided, made the default or removed, by the date recorded in `src/flags.ts`.

- `ownershipModel: 'resolver'`: Vite and Node resolve every bare import through one shared resolver, so a package loaded by both is one module. Where a package's `exports` has both `import` and `require` builds, both sides load the `require` one.
- `ownershipModel: 'resolution'`: also routes Node's `require()` of a file Vite loads to Vite's own instance, so the order a test loads files in cannot split a module. It turns `nodeMocks` on.
- `nodeMocks: true`: a `vi.mock` applies to the modules Node loads too, as `jest.mock` does under Jest. Default `false`; on with `ownershipModel: 'resolution'`, which refuses it set to `false`.

Errors from these settings are listed under [Ownership model](/guide/errors#ownership-model-experimental).

## `nativeModules`

**Type:** `'device' | 'permissive'` · **Default:** `'device'` · **Engine:** native

How native module lookups answer.

- `'device'` *(default)* — as on a device and under Jest's React Native preset. `NativeModules[name]` and `TurboModuleRegistry.get(name)` find React Native's own modules and those registered with [`mockNativeModule`](/guide/helpers#mocknativemodule-name-impl), and are `undefined` / `null` for any other name. A React Native module's stub has only the members of its codegen spec. See [which native modules exist](/guide/how-it-works#which-native-modules-exist).
- `'permissive'` — every name is present for every lookup, and every stub answers every property with a method. An escape hatch for a suite written against that behaviour while you register the modules it needs; library feature detection (`if (NativeModules.X)`) takes the "present" branch for every module in this mode.

```ts
reactNative({ nativeModules: 'permissive' })
```

## `registryBuild`

**Type:** `'background' | 'wait'` · **Default:** `'background'` · **Engine:** native

What a run does when React Native's precompiled registry is not in the cache yet: on the first run after an install, an upgrade of React Native or vitest-native, a Babel toolchain change, or a cleared `node_modules/.cache/vitest-native`.

- `'background'` *(default)* — the run starts at once while the registry compiles in a low-priority background process. Test files that start before it is ready load React Native file by file, which is slower per file; files that start after it lands use it. When Vitest closes, a build still running gets up to half of `teardownTimeout` to finish, so the next run starts warm; a run that ends cancelled (`--bail`, or Ctrl-C in a terminal) stops it at close instead, while a watch-mode cancel keeps it building for the reruns. The first run can differ from later ones in one visible way: the column numbers in React Native's own stack frames.
- `'wait'` — compile the registry before the run starts, so every file uses it.

The hot runtime, CI runs and `experimental.ownershipModel` always wait. A run counts as CI when `CI` is set to anything but `false`, or, unless `CI=false`, when one of `CONTINUOUS_INTEGRATION`, `GITHUB_ACTIONS`, `GITLAB_CI`, `BUILDKITE`, `CIRCLECI`, `TF_BUILD`, `JENKINS_URL`, `TEAMCITY_VERSION`, `TRAVIS`, `APPVEYOR`, `CODEBUILD_BUILD_ID` or `BITBUCKET_BUILD_NUMBER` is set.

```ts
reactNative({ registryBuild: 'wait' })
```

## `ownership`

**Type:** `'warn' | 'error' | { mode?: 'warn' | 'error'; allow?: { path: string; reason: string }[] }` · **Default:** `'warn'` · **Engine:** native

What happens when one file runs twice in a worker: once loaded by Vite, through your test's imports, and once by Node, through a `require()` or a package Node loads. The two copies don't share state, so a store or cache written through one is not seen by the other. Nothing else reports it.

- `'warn'`: print a warning once per worker for each such file. It names the file, how each side reached it, and the fix.
- `'error'`: fail the test file with [`SOURCE_EVALUATED_TWICE`](/guide/errors#SOURCE_EVALUATED_TWICE).
- The object form also takes `allow`: files or directories, resolved against the Vitest root, that may run twice, each with the reason. It is the only exemption; the check cannot be turned off.

## `metroConfig`

**Type:** `boolean | { configFile?: string }` · **Default:** `false` · **Engine:** both

::: warning Experimental
Opt-in while the framework and package-manager compatibility matrix is being validated. Default: `false`.
:::

Pass `metroConfig: true` to use your project's Metro source-extension order and asset list in both Vite and Node resolution:

```ts
reactNative({ metroConfig: true })
// Config outside the project root:
reactNative({ metroConfig: { configFile: '../../metro.config.cjs' } })
```

Expo's defaults prefer TypeScript over JavaScript when both variants exist; bare React Native's defaults prefer JavaScript. The profile is evaluated in a short-lived child process using the project's own Metro tooling. Explicit `assetExts` additions still apply. Metro transforms are not installed: source formats such as SVG need a corresponding Vitest/Vite transform.

A custom `resolver.resolveRequest` is code and does not run under Vitest: the source and asset extensions still apply, and a warning names the gap. Where one of its redirects matters to tests, reproduce it with `resolve.alias`. Package main fields and conditions keep the engine's own resolution ([package entry points](/guide/how-it-works#package-entry-points)); `diagnostics: true` reports the observed Metro values. Config is evaluated on startup; changing it requires restarting the run. Findings and remaining gates are recorded in [the investigation log](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/docs/metro-profile-investigation.md).

Next: [Third-Party Presets](/guide/presets).
