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
| `presets.skia()` | `@shopify/react-native-skia` | Skia's own test mock (`Mock(CanvasKit)`) over CanvasKit, Skia compiled to WebAssembly: the `Skia` API computes with real Skia, `Canvas` and its drawing render as Views; plus Skia's Reanimated helpers (`usePathValue`, `useTexture`, …) and a `matchFont` that returns a font |

## Skia

`@shopify/react-native-skia` draws through a native binding that cannot load in Node, so its preset uses Skia's own test support. It loads CanvasKit (Skia compiled to WebAssembly, a dependency of Skia itself) and serves Skia's own test mock over it. The `Skia` API (paths, matrices, colours, pictures) therefore computes with real Skia, and `Canvas` and its drawing render as React Native Views. No configuration is needed, and Skia's `jestEnv`/`jestSetup` files are not used.

Beyond Skia's own mock, the preset adds Skia's Reanimated helpers (`usePathValue`, `useTexture`, `notifyChange`, …) running over the reanimated preset. It also makes `matchFont` return a font of the requested size, because CanvasKit has no system fonts to match.

CanvasKit loads before each test file, as Skia's Jest environment does, so a project with Skia installed pays that start-up cost in every file (tens of milliseconds). If no test touches Skia, turn the preset off with `reactNative({ presets: { skia: false } })`.

## Mock resets

Preset mocks keep working through `vi.resetAllMocks()` and `mockReset: true`. A reset clears the calls each spy recorded, but a builder still chains, so `LinearTransition.springify().damping(20)` returns the transition, and a `Gesture.Pan()` built at module scope keeps its `onStart(...)`. Every preset's mock functions are built with their implementation (`vi.fn(impl)`), which Vitest restores on a reset. A package test (`tests/preset-mock-reset.test.ts`) walks every preset and fails if a reset drops one.

## Migrating from manual mocks

If you're coming from Jest, you can usually **delete** your manual native-lib mocks — no more `jest.mock('react-native-reanimated', …)`, safe-area's `jest/mock`, or gesture-handler's jestSetup. Just have the package installed; the preset handles it. See [Migrating from Jest](/migration/from-jest#delete-third-party-native-lib-mocks).

## Transitive imports

Presets are redirected even when a library is reached *transitively* — for example Reanimated pulled in via Moti or keyboard-controller, or Gesture Handler via bottom-sheet. The redirect works through both the Vite graph and Node's loader hooks, so a library doesn't have to be a direct import to be shadowed.

Next: [Test Helpers](/guide/helpers).
