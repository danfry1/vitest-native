# How It Works

The `reactNative()` plugin does three things automatically, so you don't write any setup yourself.

## 1. Module resolution

The plugin redirects `react-native` imports to its engine (real RN externalized to Node for `native`, or virtual modules for `mock`) and resolves platform-specific files — `.ios.ts`, `.android.ts`, `.native.ts` — the way Metro does. Set the [`platform` option](/guide/plugin-options) to pick which extension wins.

## 2. Asset stubbing

Image, font, and media imports are stubbed with their filename, matching React Native's bundler. So this works with no extra config:

```tsx
import logo from './logo.png'
// `logo` resolves to a stub, not a missing-module error
```

Common asset extensions (png, jpg, gif, mp4, mp3, ttf, …) are stubbed out of the box. For custom formats, use the [`assetExts` option](/guide/plugin-options).

## 3. Setup injection

The plugin auto-injects a setup file that:

- registers all mocks,
- sets React Native globals (`__DEV__`, `requestAnimationFrame`, etc.),
- wires up [`@testing-library/react-native`](https://callstack.github.io/react-native-testing-library/) if it's installed — registering its matchers, and setting host component names for older RNTL (RNTL ≥ 12 auto-detects them against real RN host names).

You do **not** add anything to `setupFiles` yourself, and you do **not** manually configure `hostComponentNames` — between the plugin and RNTL's own auto-detection, it's handled.

## 4. Transform cache

On Vitest 5 the plugin turns on Vitest's persistent transform cache (`fsModuleCache`), so warm runs reuse compiled modules from disk the way Jest reuses its transform cache. Vitest keys each entry on the module's source, the config file and its own version; the plugin adds its own version, its resolved options and a digest of the project's lockfile, so upgrading vitest-native or any dependency invalidates the cache. Set `test.fsModuleCache: false` to turn it off. The cache lives in `node_modules`, so a clean install clears it too.

## The native engine, specifically

Under `engine: 'native'`, real React Native is externalized to Node and its Flow types are stripped through a require hook using your project's `@react-native/babel-preset` — the same toolchain RN already uses. What's mocked is the layer *beneath* the components: native modules (`NativeModules`, `TurboModuleRegistry`, `UIManager`) and native-component **registration** (`NativeComponentRegistry`, `requireNativeComponent`). `View`, `Text`, `Pressable`, and the rest run their **real** component JavaScript against mock host components — this boundary sits *lower* than `@react-native/jest-preset`, which swaps whole components for passthrough mocks (see [where the boundary sits](/guide/comparison#where-the-mock-boundary-sits)).

One deliberate component-level exception: `TextInput` is replaced with the same passthrough shape Jest's preset uses, because the real `TextInput`'s internal event wiring double-fires `onChangeText` under RNTL's `userEvent.type`. That substitution is verified against real RN by the differential cross-check.

This is the same architecture as the original [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native), rebuilt to track current Vitest and React Native.

### Loader hooks run in-thread

Externalized packages loaded with `import` pass through vitest-native's Node loader hooks (preset redirects, platform extensions, on-the-fly compilation). On Node 22.15+ and 23.5+ these are installed with `module.registerHooks()` and run synchronously on each test worker's own thread. Older Node versions use `module.register()`, which runs the hooks on a separate loader thread, so every resolve and load waits on a cross-thread request. Measured on a 104-file production suite, that wait was 18% of worker CPU time. `VITEST_NATIVE_LOADER_THREAD=1` forces the threaded hooks, for comparing the two.

### A consequence worth knowing

Because RN runs externalized through Node (not your Vite source graph):

- **`vi.mock` of an externalized RN-side library may not intercept.** Libraries that load through Node bypass Vitest's mocker. Prefer a [preset](/guide/presets) (if one exists) or mock at the boundary. Your *own* modules mock normally.
- **Custom Babel plugins don't run.** Transforms go through Vite/esbuild, not your `babel.config.js`. Flow/TS stripping for RN and allow-listed packages is handled by the require hook; use the [`transform` allowlist](/guide/plugin-options) for extra pure-JS packages that ship untranspiled source.

## The mock engine, specifically

Under `engine: 'mock'`, `react-native` resolves to a pure-JS reimplementation served as virtual modules — no real RN, no Babel, just Vite. It covers [100% of RN's stable public API](/api/coverage).

Next: [Plugin Options](/guide/plugin-options).
