# Third-Party Presets

Most React Native apps depend on native libraries — Reanimated, Gesture Handler, Navigation, and friends. Under Jest you wire up a manual mock or jest-setup for each. vitest-native ships **built-in presets** that shadow these libraries' native runtimes, and they're **auto-detected** from your installed dependencies.

## Auto-detection

If a supported library is installed, its preset applies automatically — you don't have to list it:

```ts
import { reactNative } from 'vitest-native'

export default defineConfig({
  plugins: [reactNative()], // presets for installed libs apply automatically
})
```

You can still list them explicitly if you want to be deliberate:

```ts
import { reactNative, presets } from 'vitest-native'

export default defineConfig({
  plugins: [
    reactNative({
      presets: [
        presets.reanimated(),
        presets.gestureHandler(),
        presets.safeAreaContext(),
        presets.navigation(),
      ],
    }),
  ],
})
```

Presets apply under **both** engines.

## Available presets

| Preset | Library | What's mocked |
|--------|---------|---------------|
| `presets.reanimated()` | `react-native-reanimated` | `useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSpring`, `withDelay`, `withSequence`, `withRepeat`, layout animations (`FadeIn`, `FadeOut`, `SlideInRight`), `Easing`, `interpolate`, `createAnimatedComponent` |
| `presets.worklets()` | `react-native-worklets` | `runOnJS`, `runOnUI`, `scheduleOnRN`, `scheduleOnUI`, `createWorkletRuntime`, … run synchronously on the JS thread |
| `presets.gestureHandler()` | `react-native-gesture-handler` | `GestureHandlerRootView`, gesture handlers (Pan, Tap, LongPress, Pinch, Rotation, Fling), `Gesture` API (v2), `GestureDetector`, `Swipeable`, touchable wrappers, state constants |
| `presets.safeAreaContext()` | `react-native-safe-area-context` | `SafeAreaProvider`, `SafeAreaView`, `useSafeAreaInsets`, `useSafeAreaFrame`, `initialWindowMetrics`, `withSafeAreaInsets` |
| `presets.navigation()` | `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `@react-navigation/drawer`, `@react-navigation/elements` | `NavigationContainer`, `useNavigation`, `useRoute`, `useFocusEffect`, `useIsFocused`, `CommonActions`, `StackActions`, `TabActions`, `DrawerActions`, navigators |
| `presets.screens()` | `react-native-screens` | `enableScreens`, `Screen`, `ScreenContainer`, `ScreenStack` |
| `presets.asyncStorage()` | `@react-native-async-storage/async-storage` | in-memory store (`getItem`/`setItem`/`multiGet`/`mergeItem`/…) |
| `presets.expo()` | `expo-constants`, `expo-font`, `expo-asset`, `expo-splash-screen`, `expo-linking`, `expo-status-bar` | constants, fonts, assets, splash screen, linking, status bar |
| `presets.deviceInfo()` | `react-native-device-info` | string/bool/number getters with sync + async variants |
| `presets.mmkv()` | `react-native-mmkv` | in-memory `MMKV` + `useMMKV*` hooks, for mmkv 2 only: the library tests itself from v3 (its own in-memory backend under Vitest), so the preset steps aside |
| `presets.netInfo()` | `@react-native-community/netinfo` | connected-wifi state, `fetch`/`refresh`/`addEventListener`/`useNetInfo`, state-type enums |
| `presets.svg()` | `react-native-svg` | `Svg`, `Path`, `Circle`, `Rect`, `G`, … as host components |
| `presets.webview()` | `react-native-webview` | `WebView` (default + named) host component |
| `presets.vectorIcons()` | `@react-native-vector-icons/common` | `createIconSet` and the dynamic font loader shared by the v10+ scoped icon sets (not the legacy unscoped `react-native-vector-icons`) |
| `presets.flashList()` | `@shopify/flash-list` | `FlashList` rendering its data through `renderItem`, the ref surface, v2 recycler hooks |
| `presets.bottomSheet()` | `@gorhom/bottom-sheet` | `BottomSheet`, `BottomSheetModal` + provider, sheet views, scroll/list variants, `BottomSheetTextInput`, backdrop, footer |
| `presets.keyboardController()` | `react-native-keyboard-controller` | `KeyboardProvider`, `KeyboardAvoidingView`, `KeyboardAwareScrollView`, `KeyboardStickyView`, `KeyboardToolbar`; the imperative `KeyboardController` is inert |
| `presets.skia()` | `react-native-skia`, `@shopify/react-native-skia` | Skia's own test mock (`Mock(CanvasKit)`) over CanvasKit, Skia compiled to WebAssembly: the `Skia` API computes with real Skia, `Canvas` and its drawing render as Views; plus Skia's Reanimated helpers (`usePathValue`, `useTexture`, …) and a `matchFont` that returns a font |

## Skia

Skia is published as `react-native-skia` from 2.15.0 and as `@shopify/react-native-skia` up to 2.14.0; the preset shadows whichever the project has installed. It draws through a native binding that cannot load in Node, so its preset uses Skia's own test support. It loads CanvasKit (Skia compiled to WebAssembly, a dependency of Skia itself) and serves Skia's own test mock over it. The `Skia` API (paths, matrices, colours, pictures) therefore computes with real Skia, and `Canvas` and its drawing render as React Native Views. No configuration is needed, and Skia's `jestEnv`/`jestSetup` files are not used.

The named exports are read from the installed version, because Skia's API changes between releases (2.15.0 added `SkiaGraphiteView`; 3.0.5 removed `useVideo`), so an import resolves as it does in the app for whichever version the project has.

Beyond Skia's own mock, the preset adds Skia's Reanimated helpers (`usePathValue`, `useTexture`, `notifyChange`, …) running over the reanimated preset. It also makes `matchFont` and `useFont` return a font of the requested size, on Skia's default typeface, because CanvasKit has no system fonts and the mock's `useFont` ignores the size. As under Skia's Jest setup, `drawAsImage`, `drawAsPicture` and `drawAsImageFromPicture` are no-ops that return `undefined`; `Skia.PictureRecorder`, `Skia.Surface` and `makeImageSnapshot` draw for real.

The preset needs a worker pool (`threads`, the default, or `forks`): Skia's mock loads `react-native` through Node's `require`, which a VM pool does not route to the React Native mock, so a `vmThreads` or `vmForks` run is refused.

CanvasKit loads before each test file, as Skia's Jest environment does, so a project with Skia installed pays that start-up cost in every file (about 15–20 ms on one thread, more under parallel load). If CanvasKit cannot load, every test file fails with an error that names the cause. If no test touches Skia, turn the preset off with `reactNative({ presets: { skia: false } })`.

## Mock resets

Preset mocks keep working through `vi.resetAllMocks()` and `mockReset: true`. A reset clears the calls each spy recorded, but a builder still chains, so `LinearTransition.springify().damping(20)` returns the transition, and a `Gesture.Pan()` built at module scope keeps its `onStart(...)`. Every preset's mock functions are built with their implementation (`vi.fn(impl)`), which Vitest restores on a reset. A package test (`tests/preset-mock-reset.test.ts`) walks every preset and fails if a reset drops one.

## Migrating from manual mocks

If you're coming from Jest, you can usually **delete** your manual native-lib mocks — no more `jest.mock('react-native-reanimated', …)`, safe-area's `jest/mock`, or gesture-handler's jestSetup. Just have the package installed; the preset handles it. See [Migrating from Jest](/migration/from-jest#delete-third-party-native-lib-mocks).

## Your own presets

A library vitest-native has no preset for can get one of yours. Write it in a module whose default export is a preset, or a function returning one, and list the module's path; a relative path resolves from the project root:

```ts
// test/presets/my-lib.ts
import { vi } from 'vitest'

export default () => ({
  name: 'myLib',
  modules: {
    'my-lib': {
      exports: ['useThing', 'ThingView'],
      factory: () => ({ useThing: vi.fn(() => 'thing'), ThingView: () => null }),
    },
  },
})
```

```ts
// vitest.config.ts
reactNative({ presets: [presets.reanimated(), './test/presets/my-lib.ts'] })
```

A preset is listed as a path, not as an object, because its factories run in the test workers, and a function in the config cannot reach them; the plugin imports the module there, and once while it loads the config to read its name and export names. In that config-time import `react-native` is a stand-in, so a preset module may import it at its top level, and should use it only inside its factories. A preset object that is not one of vitest-native's is refused with this advice. Because an array replaces auto-detection, list vitest-native's presets you still want alongside yours. For one-off overrides of a preset that already exists, [`extendPresetMock`](/guide/helpers#extendpresetmock-pkg-overrides) is lighter.

## Transitive imports

Presets are redirected even when a library is reached *transitively* — for example Reanimated pulled in via Moti or keyboard-controller, or Gesture Handler via bottom-sheet. The redirect works through both the Vite graph and Node's loader hooks, so a library doesn't have to be a direct import to be shadowed.

Next: [Test Helpers](/guide/helpers).
