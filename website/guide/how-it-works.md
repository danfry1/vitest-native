# How It Works

The `reactNative()` plugin does three things automatically, so you don't write any setup yourself.

## 1. Module resolution

The plugin redirects `react-native` imports to its engine (real RN externalized to Node for `native`, or virtual modules for `mock`) and resolves platform-specific files — `.ios.ts`, `.android.ts`, `.native.ts` — the way Metro does. Set the [`platform` option](/guide/plugin-options) to pick which extension wins.

## 2. Assets

Image, font, and media imports evaluate to what Metro gives an app. Metro turns `require('./logo.png')` into a module that registers the asset with React Native's asset registry and exports the id it was given — a number. The plugin generates the same module, with the same descriptor Metro builds: `name`, `type`, `scales`, a content `hash`, and for images `width` and `height` in points. So React Native's asset handling works as it does on device:

```tsx
const logo = require('./logo.png')  // a number
Image.resolveAssetSource(logo)      // { uri, width, height, scale, __packager_asset: true }
<Image source={logo} />             // renders the resolved asset
```

- **Scales.** `logo@2x.png` and `logo@3x.png` are variants of `logo.png`, as in Metro: `scales` lists them, `width` and `height` are the smallest variant's divided by its scale, and resolution picks the variant for the device's pixel ratio.
- **Platforms.** A `logo.ios.png` or `logo.android.png` variant is preferred for the configured [`platform`](/guide/plugin-options).
- **Dimensions** are read from PNG, JPEG, GIF, BMP and WebP headers. Other formats (SVG, TIFF, and fonts, video and audio), and files that are not valid images, register without them.
- **Expo.** In a project `expo` resolves from, the descriptor is the one Expo's bundler registers: Expo CLI's dev-server location (`/assets/?unstable_path=…`) and `fileHashes`, one hash per scale variant. expo-asset resolves an asset through Expo only when `fileHashes` is present, so `Image` sources resolve as they do in an Expo app.
- **Which registry.** The native engine registers with React Native's real registry — the module Metro's `assetRegistryPath` names — so `Image.resolveAssetSource` and `AssetRegistry.getAssetByID` find every asset, whichever way it was loaded. The mock engine registers with the mock `AssetRegistry`, and its `Image.resolveAssetSource` resolves a registered id to the same URI the native engine produces.
- **Snapshots** show the id (a number) where an asset value is serialized, and, under the native engine, the resolved source (`uri`, `width`, `height`, `scale`) for a rendered `<Image>`. Ids follow registration order within a test file, so they are stable for that file.

Common asset extensions (png, jpg, gif, mp4, mp3, ttf, …) are handled out of the box. For custom formats, use the [`assetExts` option](/guide/plugin-options).

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

### Which native modules exist

A device has the native modules its app binary registers, and nothing else. React Native's lookups report that directly: `TurboModuleRegistry.get(name)` returns `null` and `NativeModules[name]` is `undefined` for a module the binary does not register, and `TurboModuleRegistry.getEnforcing(name)` throws. Libraries feature-detect on this (`if (NativeModules.EXDevLauncher) { … }`), and Jest's React Native preset answers the same way.

The native engine answers these lookups the way a device does:

| Module | `NativeModules[name]` / `TurboModuleRegistry.get(name)` | `TurboModuleRegistry.getEnforcing(name)` |
| --- | --- | --- |
| One React Native's own JavaScript requests (`Appearance`, `DeviceInfo`, `UIManager`, …) | A stub | A stub |
| One registered with [`mockNativeModule`](/guide/helpers#mocknativemodule-name-impl) | Your implementation | Your implementation |
| Any other name | `undefined` / `null` | A stub |

React Native's modules are read from the installed `react-native` itself, once per run: every name its own JavaScript passes to `TurboModuleRegistry.get` or `getEnforcing`, on either platform. The set therefore follows your React Native version instead of a list kept by vitest-native. `NitroModules` is also present, because the engine implements its install step.

`getEnforcing` returns a stub for any name instead of throwing. Its callers cannot run without the module, so a stub keeps code that requires a native module working without per-module setup. That stub is not registered by being requested: `NativeModules[name]` stays `undefined` for it.

A React Native module's stub has the members its codegen spec declares (`interface Spec extends TurboModule` in React Native's `Native*.js` files, read from the same installed copy), as its native object does on a device. Any other property is `undefined`, so code that probes an object for optional properties sees what it would see on a device. `NativeKeyboardObserver.captureRejections`, for example, is `undefined`, which matters when a test hands that module to Node's `EventEmitter`. A stub for a module with no known spec (one returned by `getEnforcing` for another name) answers every property with a method.

Stubs are stable objects, so `vi.spyOn(NativeModules.Vibration, 'vibrate')` records calls. To make a third-party module present, or to give it behaviour, register it with `mockNativeModule(name, impl)`; `resetAllMocks()` removes it again, and the hot runtime removes any registration a test file leaves behind before the next file runs.

One deliberate component-level exception: `TextInput` is replaced with the same passthrough shape Jest's preset uses, because the real `TextInput`'s internal event wiring double-fires `onChangeText` under RNTL's `userEvent.type`. That substitution is verified against real RN by the differential cross-check.

This is the same architecture as the original [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native), rebuilt to track current Vitest and React Native.

### Loader hooks run in-thread

Externalized packages loaded with `import` pass through vitest-native's Node loader hooks (preset redirects, platform extensions, on-the-fly compilation). On Node 22.15+ and 23.5+ these are installed with `module.registerHooks()` and run synchronously on each test worker's own thread. Older Node versions use `module.register()`, which runs the hooks on a separate loader thread, so every resolve and load waits on a cross-thread request. Measured on a 104-file production suite, that wait was 18% of worker CPU time. `VITEST_NATIVE_LOADER_THREAD=1` forces the threaded hooks, for comparing the two.

### A consequence worth knowing

Because RN runs externalized through Node (not your Vite source graph):

- **`vi.mock` of an externalized RN-side library may not intercept.** Libraries that load through Node bypass Vitest's mocker. Prefer a [preset](/guide/presets) (if one exists) or mock at the boundary. Your *own* modules mock normally.
- **Custom Babel plugins don't run.** Transforms go through Vite/esbuild, not your `babel.config.js`. Flow/TS stripping for RN and allow-listed packages is handled by the require hook; use the [`transform` allowlist](/guide/plugin-options) for extra pure-JS packages that ship untranspiled source. A plugin your tests depend on — a macro plugin such as `@lingui/babel-plugin-lingui-macro` — has to be added to the Vitest config; `vitest-native doctor` lists them and [Migrating from Jest](/migration/from-jest#babel-plugins-your-jest-run-applied) has the recipe.

## The mock engine, specifically

Under `engine: 'mock'`, `react-native` resolves to a pure-JS reimplementation served as virtual modules — no real RN, no Babel, just Vite. It covers [100% of RN's stable public API](/api/coverage).

Next: [Plugin Options](/guide/plugin-options).
