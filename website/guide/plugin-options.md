# Plugin Options

All options are optional. `reactNative()` with no arguments works for any real RN app.

```ts
reactNative({
  engine: 'auto',        // 'native' | 'mock' | 'auto' (default: 'auto' → native when available)
  platform: 'ios',       // 'ios' | 'android' (default: 'ios')
  diagnostics: false,    // Log plugin activity (default: false)
  presets: [],           // Third-party library presets
  mocks: {},             // Custom mock overrides
  assetExts: [],         // Additional asset extensions (e.g. ['.lottie', '.m4b'])
  transform: [],         // Extra node_modules packages to transform (Flow/TS/JSX), native engine
  hotRuntime: false,     // Experimental hot runtime for large native suites
})
```

## `engine`

Which engine to use. See [Choosing an Engine](/guide/engines) for the full breakdown.

- `'auto'` *(default)* — native when `@react-native/babel-preset` + `@babel/core` are present, else mock with a one-line notice.
- `'native'` — force real React Native; mock only the native boundary.
- `'mock'` — force the fast pure-JS mock.

## `platform`

`'ios'` (default) or `'android'`. Controls which platform-specific file extension wins during resolution (`.ios.ts` vs `.android.ts`) and the value of `Platform.OS`. Switch per-test at runtime with [`setPlatform`](/guide/helpers).

## `diagnostics`

Set to `true` to log plugin activity — useful when debugging resolution or which engine resolved. Default `false`.

## `presets`

An array of [third-party presets](/guide/presets). Presets are auto-detected from your installed dependencies, so listing them is usually optional:

```ts
import { reactNative, presets } from 'vitest-native'

reactNative({
  presets: [presets.reanimated(), presets.navigation()],
})
```

## `mocks`

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

(Native engine, experimental.) Keeps React Native warm across files for large suites, resetting app/test modules and common process-wide pollution between files. Uses Vitest's custom worker APIs.

```ts
reactNative({ hotRuntime: true })
```

It can dramatically cut the per-file cost on large suites, but because React Native stays resident, suites that lean on deep resident-RN-internal state (for example heavy cross-file `Animated` usage) can see cross-file interference they wouldn't under the default per-file isolation. The tell is a test that passes alone but fails after other files. See [Hot runtime](/guide/engines#hot-runtime-experimental) for when it helps, the known limitation, and worker recycling.

Next: [Third-Party Presets](/guide/presets).
