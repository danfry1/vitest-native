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
  // presets — omitted on purpose: leaving it out auto-detects your installed
  // libraries. Passing an array uses ONLY that array, so `presets: []` means none.
})
```

## `engine`

Which engine to use. See [Choosing an Engine](/guide/engines) for the full breakdown.

- `'auto'` *(default)* — native when a React Native Babel preset (`@react-native/babel-preset`, or Expo's from SDK 56) + `@babel/core` are present, else mock with a one-line notice.
- `'native'` — force real React Native; mock only the native boundary.
- `'mock'` — force the fast pure-JS mock.

## `platform`

`'ios'` (default) or `'android'`. Controls which platform-specific file extension wins during resolution (`.ios.ts` vs `.android.ts`) and the value of `Platform.OS`. To test both platforms, run them as separate Vitest projects with one plugin instance each. (Under the mock engine only, [`setPlatform`](/guide/helpers#setplatform-os) can also switch per-test at runtime; the native engine fixes the platform when the module graph loads.)

## `diagnostics`

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

Additional extensions to load as [assets](/guide/how-it-works#_2-assets) — registered with React Native's asset registry, as Metro does — beyond the built-in defaults:

```ts
reactNative({
  assetExts: ['.lottie', '.m4b'],
})
```

## `transform`

(Native engine.) Extra `node_modules` packages whose source should be transformed (Flow/TS/JSX) — the vitest-native equivalent of Jest's `transformIgnorePatterns`. Use it for pure-JS third-party libraries that ship untranspiled source:

```ts
reactNative({
  transform: ['some-untranspiled-lib'],
})
```

A listed package's own dependencies are compiled too, as an auto-detected package's are.

## `hotRuntime`

(Native engine.) Keeps React Native's precompiled factory registry and worker realm warm while resetting RN instances, app/test modules, and a verified manifest of supported process-wide state. Uses Vitest's custom worker APIs, which Vitest labels experimental.

The default, `false`, always isolates per worker, as in 0.13.0. `'auto'` opts in: it uses the hot runtime when the run can be bounded and recycled (at least two workers, no explicitly configured pool or `test.isolate`) and otherwise falls back to per-file isolation, printing why; `true` requires hot mode and fails closed when it cannot be bounded or when an explicit pool, `test.isolate`, or a CLI flag such as `--no-isolate` conflicts with it (`HOT_RUNTIME_OVERRIDDEN`).

```ts
reactNative({ hotRuntime: false }) // opt out
```

It can dramatically cut the per-file cost on large suites. The RN registry is reset from its in-memory factories per file, and the shared realm is restored through a mutation-tested state manifest. Arbitrary mutable state in an unknown resident third-party singleton cannot be discovered generically; a test that passes alone but fails after other files remains a correctness signal. See [Hot runtime](/guide/engines#hot-runtime) for the exact boundary and worker recycling.

Hot mode installs a cgroup-aware memory plan by default and requires at least two workers so it can recycle at file boundaries. A deliberate externally bounded single-worker run can use `hotRuntime: { allowUnboundedMemory: true }`; this disables the automatic worker cap and process-RSS enforcement and is intentionally noisy.

The object form tunes worker recycling: `recycleAfterFiles`, `memoryLimit` (worker heap in bytes), `allowUnboundedMemory`, `preserveGlobals` and `esmGeneration` ([Worker recycling](/guide/engines#worker-recycling)). On its own it requires the hot runtime, as `true` does. Add `mode: 'auto'` to select the way `'auto'` does: the hot runtime with your options where the run can be bounded, per-file isolation with the printed reason where it cannot.

```ts
reactNative({ hotRuntime: { mode: 'auto', memoryLimit: 2 * 1024 ** 3 } })
```

`mode: 'auto'` cannot be combined with `allowUnboundedMemory: true`. The worker count and the process-RSS limits still come from the memory plan, and `memoryLimit: 0` turns the heap threshold off.

## `nativeModules`

(Native engine.) How native module lookups answer.

- `'device'` *(default)* — as on a device and under Jest's React Native preset. `NativeModules[name]` and `TurboModuleRegistry.get(name)` find React Native's own modules and those registered with [`mockNativeModule`](/guide/helpers#mocknativemodule-name-impl), and are `undefined` / `null` for any other name. A React Native module's stub has only the members of its codegen spec. See [which native modules exist](/guide/how-it-works#which-native-modules-exist).
- `'permissive'` — every name is present for every lookup, and every stub answers every property with a method. An escape hatch for a suite written against that behaviour while you register the modules it needs; library feature detection (`if (NativeModules.X)`) takes the "present" branch for every module in this mode.

```ts
reactNative({ nativeModules: 'permissive' })
```

## `metroConfig`

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
