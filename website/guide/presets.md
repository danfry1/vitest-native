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
| `presets.unistyles()` | `react-native-unistyles`, `react-native-unistyles/reanimated` | Unistyles 3: `StyleSheet.configure`/`create` with themes, variants and compound variants, `useUnistyles`, `withUnistyles`, `UnistylesRuntime` theme switching, `mq` with `Display`/`Hide`; matches the library's own Jest mock and follows its source where that mock does less |

## Unistyles

Unistyles 3 resolves styles in native code, so its preset stands in for it. Its Babel plugin switches itself off under test (`NODE_ENV=test`), so nothing else needs configuring. The themes come from your app: load the module that calls `StyleSheet.configure` before any test renders, as the app does at startup:

```ts
// vitest.config.ts
test: { setupFiles: ['./src/unistyles.ts'] }
```

The preset agrees with Unistyles' own Jest mock (`react-native-unistyles/mocks`), which a migrating suite was written against, so that mock is no longer needed. Where that mock does less than the library, the preset follows the library's source:

- Variants and compound variants apply, and `styles.useVariants()` selects them.
- `initialTheme` and `adaptiveThemes` choose the theme, and `UnistylesRuntime.setTheme()` switches it for the next render.
- `Display` and `Hide` follow `mq` against the screen size.
- `ScopedTheme` renders its children.

One difference from a device: with several themes and none selected, a device throws on first use, while the preset falls back to the first theme, as Unistyles' Jest mock does.

## Mock resets

Preset mocks keep working through `vi.resetAllMocks()` and `mockReset: true`. A reset clears the calls each spy recorded, but a builder still chains, so `LinearTransition.springify().damping(20)` returns the transition, and a `Gesture.Pan()` built at module scope keeps its `onStart(...)`. Every preset's mock functions are built with their implementation (`vi.fn(impl)`), which Vitest restores on a reset. A package test (`tests/preset-mock-reset.test.ts`) walks every preset and fails if a reset drops one.

## Migrating from manual mocks

If you're coming from Jest, you can usually **delete** your manual native-lib mocks — no more `jest.mock('react-native-reanimated', …)`, safe-area's `jest/mock`, or gesture-handler's jestSetup. Just have the package installed; the preset handles it. See [Migrating from Jest](/migration/from-jest#delete-third-party-native-lib-mocks).

## Transitive imports

Presets are redirected even when a library is reached *transitively* — for example Reanimated pulled in via Moti or keyboard-controller, or Gesture Handler via bottom-sheet. The redirect works through both the Vite graph and Node's loader hooks, so a library doesn't have to be a direct import to be shadowed.

Next: [Test Helpers](/guide/helpers).
