# vitest-native

Run your React Native tests under Vitest, against **real React Native** — the same JavaScript
that ships in your app, mocking only the native-module boundary. That's the zero-config default.
A fast pure-JS **mock** engine is available as an opt-in for RN-free unit tests. One plugin.

**📖 Documentation: [danfry1.github.io/vitest-native](https://danfry1.github.io/vitest-native/)**

> **Beta.** The reproducible guarantee is a CI-gated behavioral cross-check that runs the same
> assertions under the mock engine **and** real React Native across RN 0.81–0.85, failing the build
> on any divergence. We've also exercised the native engine against real apps in our own testing
> (react-native-paper, the obytes template, Rocket.Chat). Some APIs may still shift before 1.0.
>
> Maintained successor to
> [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native)
> — same core idea (externalize RN, run its real JS under Node), rebuilt for modern Vitest (v4).
> Coming from it? See [Migrating from `vitest-react-native`](packages/vitest-native/docs/migrating-from-vitest-react-native.md).

## Why vitest-native

Two engines behind one plugin, so you choose the fidelity each suite needs:

- **`engine: 'native'`** *(default)* — runs **real React Native** JS, mocking only the thin native
  boundary (native modules, `UIManager`, and the native host-component registry — *not* the
  `View`/`Text`/`ScrollView` component JS, which runs for real). Jest's preset mocks a superset of
  this (it also swaps RN's core components for stand-ins), so the native engine has higher fidelity
  for accessibility, RN-API behavior, and integration, with no mock drift. This is what
  `reactNative()` gives you.
- **`engine: 'mock'`** — a fast, zero-dependency pure-JS reimplementation of React Native. The
  opt-in escape hatch for pure-logic suites, environment control, and maximum determinism.

**It's the strongest fit when you:**

- **start a new RN project or write new tests** — great DX, zero migration cost;
- **want real-RN fidelity** that mock-based runners can't give you;
- **already use Vitest** elsewhere and want one runner across your codebase;
- **want to adopt incrementally** — write new tests on vitest-native *alongside* your
  existing Jest suite, and migrate older tests as you touch them.

Migrating a large, deeply Jest-coupled suite *wholesale* is possible but **not turnkey** — see
[Migrating from Jest](#migrating-from-jest). In our own testing we've run it against real apps: a
fresh test suite against react-native-paper passed cleanly, and we migrated existing Jest suites
from the [obytes template](https://github.com/obytes/react-native-template-obytes) (near-complete
pass rate) and Rocket.Chat (which surfaced — and let us fix — real boundary bugs). These were
local runs; the part you can reproduce yourself is the cross-check below.

## Quick Start

```bash
# npm
npm install -D vitest-native

# yarn
yarn add -D vitest-native

# pnpm
pnpm add -D vitest-native

# bun
bun add -d vitest-native
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';

export default defineConfig({
  plugins: [reactNative()],
});
```

That's it. Write your tests:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react-native';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByText('Hello')).toBeTruthy();
  });
});
```

## Requirements

- **Node.js** >= 20
- **Vitest** 4.x
- **Vite** ^6.4.2, ^7.3.2, or ^8.0.5
- **React** >= 18
- **`engine: 'native'`** (the default) needs `@react-native/babel-preset` + `@babel/core` (these
  ship with React Native projects). The opt-in mock engine needs no Babel.
- **React Native** 0.81–0.85 validated in CI (native engine).

## Choosing an engine

```ts
reactNative()                      // default — real React Native (native), when its babel deps are present
reactNative({ engine: 'native' })  // force real React Native; mock only the native boundary
reactNative({ engine: 'mock' })    // opt in to the fast pure-JS mock
reactNative({ engine: 'auto' })    // the default — native when available, else mock (with a one-line notice)
```

`reactNative()` with no options resolves to **native** whenever `@react-native/babel-preset` and
`@babel/core` are present (i.e. any real RN app), falling back to `mock` only when they're absent.
Both engines share the same test API (RNTL, the helpers, the presets). Reach for `mock` when you
want no RN at all — fast, deterministic, environment-controllable.

## Features

- **Zero config** — Plugin auto-injects setup files and configures RNTL. No manual `setupFiles` needed.
- **Real React Native by default** — `native` runs RN's real JS, mocking only the native boundary;
  the opt-in `mock` engine is a fast pure-JS reimplementation for when you want no RN at all.
- **Single package** — One install replaces three.
- **Same toolchain as RN** — `native` Flow-strips real React Native via your project's Babel preset,
  the toolchain RN already uses. The `mock` engine needs no Babel — it's just Vite.
- **100% public API coverage** (mock engine) — every stable React Native export is mocked.
- **RNTL compatible** — Works with `@testing-library/react-native` automatically.
- **Third-party presets** — auto-detected mocks for reanimated, gesture handler, safe area,
  navigation, screens, async-storage, device-info, mmkv, svg, webview, and Expo.
- **Jest-compat layer** — `vitest-native/jest-compat` eases migrating existing Jest suites.
- **Test helpers** — `setPlatform`, `setDimensions`, `setColorScheme`, `mockNativeModule` for easy state control.
- **TypeScript first** — Full type safety across the entire API.

## How It Works

The plugin does three things automatically:

1. **Module resolution** — Redirects `react-native` imports to virtual modules and resolves platform-specific files (`.ios.ts`, `.android.ts`, `.native.ts`)
2. **Asset stubbing** — Stubs image/font/media imports with their filename, matching React Native's bundler
3. **Setup injection** — Auto-injects a setup file that registers all mocks, sets React Native globals (`__DEV__`, `requestAnimationFrame`, etc.), and wires up `@testing-library/react-native` if installed (registering its matchers, and setting host component names for older RNTL; RNTL ≥ 12 auto-detects them against real RN host names)

## Plugin Options

```ts
reactNative({
  platform: 'ios',       // 'ios' | 'android' (default: 'ios')
  diagnostics: false,    // Log plugin activity (default: false)
  presets: [],           // Third-party library presets
  mocks: {},             // Custom mock overrides
  assetExts: [],         // Additional asset extensions (e.g. ['.lottie', '.m4b'])
});
```

## Test Helpers

```ts
import {
  setPlatform,
  setDimensions,
  setColorScheme,
  mockNativeModule,
  resetAllMocks,
} from 'vitest-native/helpers';

// Switch platform for a test
setPlatform('android');

// Override screen dimensions
setDimensions({ width: 768, height: 1024 });

// Switch to dark mode
setColorScheme('dark');

// Mock a native module
mockNativeModule('MyNativeModule', {
  getValue: () => Promise.resolve(42),
  doSomething: () => {},
});

// Reset everything back to defaults (iOS, 390x844, light, clears all spies)
resetAllMocks();
```

### Keyboard & AppState Test Helpers

The Keyboard and AppState mocks include internal helpers for simulating state changes:

```ts
import { Keyboard, AppState } from 'react-native';

// Simulate keyboard show/hide (fires keyboardDidShow/keyboardDidHide listeners)
(Keyboard as any)._show(336);  // height in pixels
(Keyboard as any)._hide();

// Simulate app state change (fires 'change' listeners)
(AppState as any)._setState('background');
```

These are reset automatically by `resetAllMocks()`.

## Third-Party Presets

```ts
import { reactNative, presets } from 'vitest-native';

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
});
```

### Available Presets

| Preset | Library | What's Mocked |
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

All presets are **auto-detected** from your installed dependencies — listing them explicitly is
optional. They apply under **both** engines.

## API Coverage

vitest-native's mock engine covers **every stable React Native public export** — 82/82 stable
exports as of RN 0.84 (7 unstable/experimental internals are intentionally skipped; see
[Not Covered](#not-covered)). Parity is enforced by a CI-gated `check-compat` script that diffs
the mock against real RN's export list weekly.

### Components (27)

View, Text, TextInput, Image, ScrollView, FlatList, SectionList, VirtualizedList, VirtualizedSectionList, Modal, Pressable, Touchable, TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback, TouchableNativeFeedback, ActivityIndicator, Button, Switch, RefreshControl, StatusBar, SafeAreaView, KeyboardAvoidingView, ImageBackground, InputAccessoryView, DrawerLayoutAndroid, ProgressBarAndroid

**Component instance methods** are supported via refs: TextInput (`focus`, `blur`, `clear`, `isFocused`), ScrollView (`scrollTo`, `scrollToEnd`), FlatList (`scrollToIndex`, `scrollToOffset`, `scrollToEnd`, `recordInteraction`), SectionList (`scrollToIndex`, `scrollToLocation`, `scrollToEnd`, `recordInteraction`).

### APIs (30)

Platform, StyleSheet, Dimensions, Animated, Alert, Linking, Keyboard, AppState, BackHandler, Vibration, PermissionsAndroid, Appearance, PixelRatio, LayoutAnimation, Share, AccessibilityInfo, InteractionManager, PanResponder, ToastAndroid, ActionSheetIOS, LogBox, Easing, I18nManager, DeviceEventEmitter, Clipboard, AppRegistry, Settings, DevSettings, Systrace, PushNotificationIOS

### Animated

Full animation API including `timing`, `spring`, `decay`, `sequence`, `parallel`, `stagger`, `loop`, `delay`, `event`, and arithmetic operators (`add`, `subtract`, `multiply`, `divide`, `modulo`, `diffClamp`). `Animated.View`, `Animated.Text`, `Animated.Image`, `Animated.ScrollView` are real React components (not string literals) compatible with RNTL.

### Hooks (3)

useColorScheme, useWindowDimensions, useAnimatedValue

### Native Internals (8)

NativeModules, TurboModuleRegistry, UIManager, NativeEventEmitter, NativeAppEventEmitter, NativeComponentRegistry, NativeDialogManagerAndroid, requireNativeComponent

### Utilities (11)

processColor, findNodeHandle, PlatformColor, DynamicColorIOS, RootTagContext, ReactNativeVersion, UTFSequence, codegenNativeCommands, codegenNativeComponent, registerCallableModule, unstable_batchedUpdates

### Not Covered

The following **unstable/experimental/private** exports are intentionally not mocked. These are React Native internals not intended for use in application code:

| Export | Reason |
|--------|--------|
| `DevMenu` | Private dev tooling, not used in production code |
| `experimental_LayoutConformance` | Experimental API, subject to change without notice |
| `unstable_NativeText` | Internal renderer primitive |
| `unstable_NativeView` | Internal renderer primitive |
| `unstable_TextAncestorContext` | Internal context for Text nesting detection |
| `unstable_VirtualView` | Private experimental component |
| `VirtualViewMode` | Private experimental enum |

If your code imports any of these, you can provide a custom mock via the `mocks` option:

```ts
reactNative({
  mocks: {
    unstable_NativeText: MyCustomMock,
  },
})
```

## Troubleshooting

### "vitest-native helpers called before setup"

This means the plugin isn't configured. Ensure `reactNative()` is in your `vitest.config.ts` plugins array.

### RNTL queries not finding components

Host component names are handled for you — the plugin sets them for older RNTL, and RNTL ≥ 12 auto-detects them against real RN host names. If you're having issues:
1. Make sure `@testing-library/react-native` is installed
2. Don't manually configure `hostComponentNames` — leave it to the plugin / RNTL's auto-detection

### Asset imports returning undefined

The plugin stubs common asset extensions (png, jpg, gif, mp4, mp3, ttf, etc.). For custom formats, use `assetExts`:

```ts
reactNative({
  assetExts: ['.lottie', '.m4b'],
})
```

### "Invalid hook call" warnings in test output

If calling `useColorScheme` or `useWindowDimensions` directly outside a component (e.g., in API tests), you'll see a React warning in stderr. The mock handles this gracefully with a try/catch fallback. The test will still pass — the warning is expected.

## Jest compatibility (`jest-compat`)

`vitest-native/jest-compat` lets an existing Jest suite run under Vitest **without rewriting
`jest.*` to `vi.*`**. Your test files keep their `jest` calls and just work — it's an opt-in
layer that clears the mechanical Jest-API coupling (not a full auto-migration).

```ts
import { reactNative } from 'vitest-native';
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from 'vitest-native/jest-compat';

export default defineConfig({
  plugins: [reactNative({ engine: 'native' }), jestMockTransform()], // or engine: 'mock'
  resolve: { alias: { ...jestCompatAliases() } },
  test: { globals: true, setupFiles: [jestCompatSetup] },
});
```

| Piece | What it does |
|---|---|
| `jestCompatSetup` | Installs a `jest` global backed by Vitest's `vi`, so `jest.fn` / `jest.spyOn` / `jest.useFakeTimers` work unchanged. Adds the sync `jest.requireActual` / `requireMock` that Vitest only ships as async, a global `require`, and no-ops `jest.setTimeout`. |
| `jestMockTransform()` | A Vite plugin that makes top-level `jest.mock(...)` actually apply. Vitest only hoists `vi.mock`, so it rewrites `jest.mock` / `unmock` / `doMock` / `doUnmock` to the hoisted `vi.*` form, and runs each factory's return through Jest's CommonJS interop (so `() => Component` and named-only factories resolve the way Jest resolves them). |
| `jestCompatAliases()` | `resolve.alias` entries: `@jest/globals` → a Vitest-globals shim (unblocks `@testing-library/react-native` < 12), and `@testing-library/jest-native/extend-expect` → a no-op (those matchers are already registered). |

You don't swap the test API:

| In your Jest test | Under jest-compat |
|---|---|
| `jest.fn()`, `jest.spyOn()`, `jest.useFakeTimers()` | work as-is (the global `jest` **is** `vi`) |
| `import { jest } from '@jest/globals'` | resolves to the `vi`-backed `jest` (aliased) |
| top-level `jest.mock('m', factory)` | hoisted + applied, with Jest's factory interop |
| `describe` / `it` / `expect` / `beforeEach` | same names, available as globals |

**What it does *not* do:** it clears the API coupling, not the suite-specific work — you still
write mocks for native libraries with no preset, re-record snapshots, and fix the occasional
factory that references an out-of-scope `mock`-prefixed variable (Jest's Babel plugin allows
that; Vitest doesn't).

## Migrating from Jest

**Honest expectation:** a brand-new test is a drop-in. Migrating an existing, deeply
Jest-coupled suite is **incremental, not turnkey** — real RN suites couple to Jest at many
levels (the `jest` global, `jest.mock('react-native')`, `@react-native/jest-preset`,
jest-native matchers, recorded snapshots, native-lib mocks). The
[`jest-compat`](#jest-compatibility-jest-compat) layer above clears the mechanical API
coupling; the rest is suite-specific.

**Recommended path — adopt incrementally.** Point vitest-native at *new* tests (zero migration
cost, better DX, real-RN fidelity when you want it) while your existing Jest suite keeps running
on Jest. Migrate older tests as you touch them, rather than all at once.

→ **Full guide:**
[`packages/vitest-native/docs/migrating-from-jest.md`](packages/vitest-native/docs/migrating-from-jest.md).

## How it compares to Jest

Jest with `@react-native/jest-preset` is the React Native standard and works well. Reach for
vitest-native when you value:

- **Higher-fidelity option** — Both Jest's RN preset and vitest-native run real RN JS and mock the
  native side, but at different boundaries. Jest's preset replaces RN's core components (`View`,
  `Text`, `ScrollView`, `TextInput`, `Image`, `Modal`) and a few APIs with simplified passthrough
  mocks, so you test stand-ins. vitest-native's `engine: 'native'` mocks only the deeper native
  boundary, so your tests run RN's *real* component JS — they even render real host names like
  `RCTView`/`RCTText`. And you can still drop to a fast full mock (`engine: 'mock'`) when you
  don't need that.
- **DX** — Vitest's watch mode, UI, and native ESM tooling.
- **Unification** — one runner if you also test web/server code with Vitest.

It is **not** primarily a speed play: with `engine: 'native'` and isolation on, it isn't
categorically faster than Jest today. Choose it for the fidelity option and DX — not raw speed.

## Contributing

```bash
bun install
bun run --filter vitest-native build
bun run --filter vitest-native test
```

## License

MIT
