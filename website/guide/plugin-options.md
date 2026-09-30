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
  hotRuntime: 'auto',    // Hot runtime where it can be bounded (default); false to isolate per worker
  // presets — omitted on purpose: leaving it out auto-detects your installed
  // libraries. Passing an array uses ONLY that array, so `presets: []` means none.
})
```

## `engine`

Which engine to use. See [Choosing an Engine](/guide/engines) for the full breakdown.

- `'auto'` *(default)* — native when `@react-native/babel-preset` + `@babel/core` are present, else mock with a one-line notice.
- `'native'` — force real React Native; mock only the native boundary.
- `'mock'` — force the fast pure-JS mock.

## `platform`

`'ios'` (default) or `'android'`. Controls which platform-specific file extension wins during resolution (`.ios.ts` vs `.android.ts`) and the value of `Platform.OS`. To test both platforms, run them as separate Vitest projects with one plugin instance each. (Under the mock engine only, [`setPlatform`](/guide/helpers#setplatform-os) can also switch per-test at runtime; the native engine fixes the platform when the module graph loads.)

## `diagnostics`

Set to `true` to log plugin activity — useful when debugging resolution or which engine resolved. Default `false`.

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

Custom mock overrides, keyed by export name. Useful for the handful of [unstable/private RN exports](/api/coverage#not-covered) that aren't mocked:

```ts
reactNative({
  mocks: {
    unstable_NativeText: MyCustomMock,
  },
})
```

## `assetExts`

Additional asset extensions to stub, beyond the built-in defaults:

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

## `hotRuntime`

(Native engine.) Keeps React Native's precompiled factory registry and worker realm warm while resetting RN instances, app/test modules, and a verified manifest of supported process-wide state. Uses Vitest's custom worker APIs, which Vitest labels experimental.

The default, `'auto'`, uses it when the run can be bounded and recycled (at least two workers, no explicitly configured pool, no Jest-migration setup) and otherwise falls back quietly to per-file isolation; `diagnostics: true` prints why. `false` always isolates per worker; `true` requires hot mode and fails closed when it cannot be bounded.

```ts
reactNative({ hotRuntime: false }) // opt out
```

It can dramatically cut the per-file cost on large suites. The RN registry is reset from its in-memory factories per file, and the shared realm is restored through a mutation-tested state manifest. Arbitrary mutable state in an unknown resident third-party singleton cannot be discovered generically; a test that passes alone but fails after other files remains a correctness signal. See [Hot runtime](/guide/engines#hot-runtime) for the exact boundary and worker recycling.

Hot mode installs a cgroup-aware memory plan by default and requires at least two workers so it can recycle at file boundaries. A deliberate externally bounded single-worker run can use `hotRuntime: { allowUnboundedMemory: true }`; this disables the automatic worker cap and process-RSS enforcement and is intentionally noisy.

Next: [Third-Party Presets](/guide/presets).
