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
| `presets.gestureHandler()` | `react-native-gesture-handler` | `GestureHandlerRootView`, gesture handlers (Pan, Tap, LongPress, Pinch, Rotation, Fling), `Gesture` API (v2), `GestureDetector`, `Swipeable`, touchable wrappers, state constants |
| `presets.safeAreaContext()` | `react-native-safe-area-context` | `SafeAreaProvider`, `SafeAreaView`, `useSafeAreaInsets`, `useSafeAreaFrame`, `initialWindowMetrics`, `withSafeAreaInsets` |
| `presets.navigation()` | `@react-navigation/native` (+ native-stack, bottom-tabs, drawer, elements) | `NavigationContainer`, `useNavigation`, `useRoute`, `useFocusEffect`, `useIsFocused`, `CommonActions`, `StackActions`, `TabActions`, `DrawerActions`, navigators |
| `presets.screens()` | `react-native-screens` | `enableScreens`, `Screen`, `ScreenContainer`, `ScreenStack` |
| `presets.asyncStorage()` | `@react-native-async-storage/async-storage` | in-memory store (`getItem`/`setItem`/`multiGet`/`mergeItem`/…) |
| `presets.expo()` | `expo-constants`, `expo-font`, `expo-asset`, `expo-linking`, `expo-status-bar`, … | constants, fonts, linking, status bar, splash screen |
| `presets.deviceInfo()` | `react-native-device-info` | string/bool/number getters with sync + async variants |
| `presets.mmkv()` | `react-native-mmkv` | in-memory `MMKV` + `useMMKV*` hooks |
| `presets.svg()` | `react-native-svg` | `Svg`, `Path`, `Circle`, `Rect`, `G`, … as host components |
| `presets.webview()` | `react-native-webview` | `WebView` (default + named) host component |

## Migrating from manual mocks

If you're coming from Jest, you can usually **delete** your manual native-lib mocks — no more `jest.mock('react-native-reanimated', …)`, safe-area's `jest/mock`, or gesture-handler's jestSetup. Just have the package installed; the preset handles it. See [Migrating from Jest](/migration/from-jest#delete-third-party-native-lib-mocks).

## Transitive imports

Presets are redirected even when a library is reached *transitively* — for example Reanimated pulled in via Moti or keyboard-controller, or Gesture Handler via bottom-sheet. The redirect works through both the Vite graph and Node's loader hooks, so a library doesn't have to be a direct import to be shadowed.

Next: [Test Helpers](/guide/helpers).
