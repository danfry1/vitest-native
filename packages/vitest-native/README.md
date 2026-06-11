# vitest-native

Run your React Native tests under Vitest, against **real React Native** — the same JavaScript that ships in your app, with only the native-module boundary mocked. That is the default and the point of the project. A lightweight pure-JS mock engine is available as an opt-in for fast, RN-free unit tests.

> **Beta.** The real-RN engine is validated against real apps (react-native-paper, the obytes template, Rocket.Chat) across React Native 0.81–0.84, with a CI-gated behavioral cross-check against real RN. Some APIs may still shift before 1.0.
>
> Spiritual successor to [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native) — same core idea (externalize RN, run its real JS under Node), rebuilt for modern Vitest (4+).

---

## Table of Contents

- [Why vitest-native?](#why-vitest-native)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Plugin Options](#plugin-options)
- [Mocked Components and APIs](#mocked-components-and-apis)
- [React Native Test Suite Conformance](#react-native-test-suite-conformance)
- [Test Helpers](#test-helpers)
- [Auto-Detect Presets](#auto-detect-presets)
- [Migrating from `vitest-react-native`](#migrating-from-vitest-react-native)
- [Migrating from Jest](#migrating-from-jest)
- [Troubleshooting](#troubleshooting)
- [RNTL Matchers](#rntl-matchers)
- [Animated Matchers (Reanimated)](#animated-matchers-reanimated)
- [Snapshot Serializer](#snapshot-serializer)
- [Platform Extensions](#platform-extensions)
- [Asset Stubs](#asset-stubs)
- [Diagnostics](#diagnostics)
- [Requirements](#requirements)
- [License](#license)

---

## Why vitest-native?

Testing React Native code with Jest has traditionally required a patchwork of configuration: custom transformers, manual mock files, preset packages, and brittle `jest.setup.js` scripts that break across React Native versions. Each new library (Reanimated, Gesture Handler, Safe Area, Navigation) adds another mock to maintain.

`vitest-native` replaces all of that with a single Vite plugin:

- **Real React Native, by default.** `reactNative()` with no options runs React Native's real JavaScript — the same source that ships in your app — mocking only the native-module boundary. Jest's preset replaces many components and modules (`View`, `Text`, `ScrollView`, `Linking`, `AccessibilityInfo`, `Image`, …) with stubs; vitest-native runs the real ones. See [`engine`](#engine).
- **The runner you already use.** Already on Vitest for web? Write your React Native tests in the same runner — same config patterns, native ESM, watch mode, and UI. One test stack across web and native.
- **No Jest config patchwork.** Add one plugin instead of custom transformers, `transformIgnorePatterns`, and brittle `jest.setup.js` mock files.
- **Auto-detect presets.** The plugin scans your `node_modules` and shadows native-runtime libraries (Reanimated, Gesture Handler, Safe Area, Navigation) automatically — under both engines.
- **Opt-in mock engine.** Prefer no React Native at all for a pure-logic suite? `engine: 'mock'` reimplements RN in pure JS with **zero extra dependencies**. It is the escape hatch, not the headline — see [Choosing an engine](#engine).

> **Coming from Jest?** This is not a drop-in swap. New tests are friction-free; an existing Jest suite needs porting off `@react-native/jest-preset`, `@jest/globals`, and `jest.mock('react-native')`. See [Migrating from Jest](#migrating-from-jest). Coming from `vitest-react-native`? You are already vitest-shaped — migration is close to a package swap.

---

## Installation

```bash
# bun
bun add -d vitest-native

# npm
npm install -D vitest-native

# yarn
yarn add -D vitest-native

# pnpm
pnpm add -D vitest-native
```

---

## Quick Start

Create or update your `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';

export default defineConfig({
  plugins: [reactNative()],
});
```

That is it. Write a test:

```tsx
import { render, screen } from '@testing-library/react-native';
import { View, Text } from 'react-native';

function Greeting({ name }: { name: string }) {
  return (
    <View>
      <Text>Hello, {name}</Text>
    </View>
  );
}

test('renders a greeting', () => {
  render(<Greeting name="World" />);
  expect(screen.getByText('Hello, World')).toBeTruthy();
});
```

Run it:

```bash
npx vitest
```

---

## Plugin Options

The `reactNative()` function accepts an optional configuration object:

```ts
import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';

export default defineConfig({
  plugins: [
    reactNative({
      engine: 'auto',          // 'auto' | 'mock' | 'native' — auto → native when RN's babel deps are present, else mock
      platform: 'ios',        // 'ios' | 'android' (default: 'ios')
      presets: [],             // Preset[] -- omit for auto-detect
      mocks: {},               // Custom mock overrides for the react-native module
      diagnostics: false,      // Enable verbose logging
      assetExts: ['.lottie'],  // Additional asset extensions to stub
    }),
  ],
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `'auto' \| 'mock' \| 'native'` | `'auto'` | How React Native is provided to your tests. `auto` runs real RN (native) when available, else mock. See [`engine`](#engine) below. |
| `platform` | `'ios' \| 'android'` | `'ios'` | Target platform. Controls `Platform.OS`, version defaults, and file extension resolution. |
| `presets` | `Preset[]` | auto-detect | Built-in library presets. When omitted, installed packages are detected automatically. Only built-in presets are supported; for custom module mocking, use `vi.mock()` in a setup file. |
| `mocks` | `Record<string, any>` | `{}` | JSON-serializable overrides merged into the `react-native` module mock. Function values are not supported; use `vi.mock()` in a setup file for function-based overrides. |
| `diagnostics` | `boolean` | `false` | Log plugin activity to the console for debugging. |
| `assetExts` | `string[]` | `[]` | Additional file extensions to stub as asset imports (beyond the built-in set). |
| `transform` | `string[]` | `[]` | **`engine: 'native'` only.** Extra `node_modules` packages whose source the native engine should transform (Flow/TS/JSX stripped) as it loads them — for third-party RN libraries that ship untranspiled source (e.g. `react-native-reanimated`). Analogous to Jest's `transformIgnorePatterns` allowlist. |

### `engine`

Choose how React Native is provided to your tests:

- `'native'` — runs the **real** React Native JavaScript (component logic, prop
  computation, validation, reconciliation), mocking only the native module boundary that
  requires a device. Jest's `react-native` preset replaces many of these modules with
  stubs, so the native engine exercises behavior Jest's mocks skip (see [Fidelity](#fidelity)
  below). Best for components, integration, RNTL, virtualized lists, and anywhere a false
  pass is costly. Requires `@react-native/babel-preset` and `@babel/core` (present by
  default in React Native apps).
- `'mock'` — a lightweight, pure-JS reimplementation of React Native with **zero extra
  dependencies**. Best for pure-logic/unit tests, maximum determinism, or when you can't
  add the babel deps. Like Jest's preset, it is a simplification — see [Fidelity](#fidelity).
- `'auto'` *(default)* — picks automatically, and **resolves to `'native'`** whenever
  `@react-native/babel-preset` and `@babel/core` are present (i.e. in any real RN app). It
  falls back to `'mock'` only when those deps are absent, printing one line to explain why.
  So `reactNative()` with no options runs real React Native. Set `engine: 'mock'` to opt out.

```ts
reactNative({ engine: 'native' })
```

#### Fidelity

Jest's `react-native` preset replaces many real modules with stubs, so behavior they
don't implement passes silently. The `native` engine runs the real implementations, so
those checks actually run. For example:

| Behavior | `engine: 'native'` (real RN) | Jest `react-native` preset |
|---|---|---|
| `Linking.openURL(123)` | throws `Invalid URL: should be a string` | accepts without validating |
| `Linking.openURL('')` | throws `Invalid URL: cannot be empty` | accepts without validating |
| `<Text>` host props | `accessible`, `allowFontScaling`, `ellipsizeMode` computed by real `Text.js` | not set |

The `mock` engine is a simplification too, so it diverges from real RN the same way — reach
for `native` when a false pass would be costly. These specific differences are produced by
the cross-check/fidelity harnesses in the repository's `bench/` directory.

---

## Mocked Components and APIs

Under the `mock` engine, the plugin provides a comprehensive mock of the `react-native` module. Every mocked component renders as a named host element (making snapshots readable), and every mocked API function is a Vitest `vi.fn()` spy.

### Components (21)

| Component | Component | Component |
|---|---|---|
| View | Text | Image |
| TextInput | ScrollView | FlatList |
| SectionList | Modal | Pressable |
| TouchableOpacity | TouchableHighlight | TouchableWithoutFeedback |
| TouchableNativeFeedback | ActivityIndicator | Button |
| Switch | RefreshControl | StatusBar |
| SafeAreaView | KeyboardAvoidingView | ImageBackground |
| VirtualizedList | InputAccessoryView | DrawerLayoutAndroid |

### APIs (25+)

| API | API | API |
|---|---|---|
| Platform | Dimensions | StyleSheet |
| Animated | Alert | Linking |
| AppState | Keyboard | BackHandler |
| Vibration | PermissionsAndroid | Appearance |
| PixelRatio | LayoutAnimation | Clipboard |
| Share | AccessibilityInfo | InteractionManager |
| PanResponder | ToastAndroid | ActionSheetIOS |
| LogBox | Easing | I18nManager |
| DeviceEventEmitter | | |

### Native Bridge

| Export | Description |
|---|---|
| `NativeModules` | Proxy that returns no-op modules for any key |
| `TurboModuleRegistry` | Proxy with `getEnforcing` / `get` stubs |
| `UIManager` | Stubbed layout manager |
| `NativeEventEmitter` | Event emitter constructor mock |
| `requireNativeComponent` | Returns a named component mock |

### Hooks

| Hook | Default Value |
|---|---|
| `useColorScheme` | `'light'` |
| `useWindowDimensions` | `{ width: 390, height: 844, scale: 3, fontScale: 1 }` |

---

## React Native Test Suite Conformance

vitest-native ports tests from React Native's own test suite (Flow stripped, Jest → Vitest) to validate mock behavioral parity — the same checks Meta uses to verify React Native itself:

- **Easing** — all 24 easing curve tests including sample data for quad, cubic, sin, exp, circle, and back
- **Bezier** — 9 cubic bezier mathematical property tests (symmetry, projection, boundary conditions)
- **flattenStyle** — 12 style merging tests covering override precedence, reference identity, and recursive flattening
- **processColor** — 9 color format conversion tests for named colors, RGB, RGBA, HSL, HSLA, and hex
- **Interpolation** — 12 numeric and string range mapping tests, including string output ranges (`deg`/`%`/arbitrary suffixes) and extrapolate modes (extend/clamp/identity)
- **Animated** — 36 tests for listeners, events, forkEvent, diffClamp, Color normalization, sequence chaining/interruption/restart, parallel start/stop/no-double-stop, loop iterations/indefinite/interrupt/resetBeforeIteration, delay in sequence, stagger, and value tracking

102 tests ported from React Native's own test suite, all passing (`vitest run tests/rn-conformance/`). A few edge cases — hex-colour interpolation and infinite input ranges — are skipped and documented in the test files.

---

## Test Helpers

Import helpers from `vitest-native/helpers` to control mock state during tests.

```ts
import {
  setPlatform,
  setDimensions,
  setColorScheme,
  setInsets,
  mockNativeModule,
  resetAllMocks,
} from 'vitest-native/helpers';
```

### `setPlatform(os)`

Switch the platform for the current test. Updates `Platform.OS`, `Platform.Version`, and `Platform.select`.

```ts
import { setPlatform } from 'vitest-native/helpers';

test('renders Android-specific UI', () => {
  setPlatform('android');
  // Platform.OS is now 'android', Platform.Version is 34
  // Platform.select({ ios: 'A', android: 'B' }) returns 'B'
});
```

### `setDimensions(dims)`

Update `Dimensions.get()` and the `useWindowDimensions` hook return value.

```ts
import { setDimensions } from 'vitest-native/helpers';

test('adapts to tablet dimensions', () => {
  setDimensions({ width: 768, height: 1024, scale: 2, fontScale: 1 });
  // Dimensions.get('window') returns { width: 768, height: 1024, ... }
  // useWindowDimensions() returns the same
});
```

### `setColorScheme(scheme)`

Switch the color scheme. Affects `Appearance.getColorScheme()` and the `useColorScheme` hook.

```ts
import { setColorScheme } from 'vitest-native/helpers';

test('renders dark mode styles', () => {
  setColorScheme('dark');
  // useColorScheme() returns 'dark'
  // Appearance.getColorScheme() returns 'dark'
});
```

### `setInsets(insets)`

Update the safe area insets returned by `useSafeAreaInsets()` from `react-native-safe-area-context`. Requires the `safeAreaContext` preset to be active.

```ts
import { setInsets } from 'vitest-native/helpers';

test('renders with no bottom inset (Android)', () => {
  setInsets({ top: 24, bottom: 0 });
  // useSafeAreaInsets() returns { top: 24, right: 0, bottom: 0, left: 0 }
});
```

### `mockNativeModule(name, impl)`

Register a custom native module mock. The module becomes available via `NativeModules[name]`.

```ts
import { mockNativeModule } from 'vitest-native/helpers';

test('uses a custom native module', () => {
  mockNativeModule('MyBridge', {
    getValue: vi.fn().mockResolvedValue(42),
  });

  const { NativeModules } = require('react-native');
  await expect(NativeModules.MyBridge.getValue()).resolves.toBe(42);
});
```

### `resetAllMocks()`

Reset all mocks to their default state. Restores platform to iOS, dimensions to iPhone 14 Pro defaults (390x844), color scheme to `'light'`, safe area insets to iPhone defaults, clears AsyncStorage data, clears all mock call history, and undoes any `mockNativeModule` calls.

```ts
import { resetAllMocks } from 'vitest-native/helpers';

afterEach(() => {
  resetAllMocks();
});
```

---

## Auto-Detect Presets

When the `presets` option is omitted, the plugin scans your `node_modules` and automatically enables mocks for installed third-party libraries:

| Package | What Gets Mocked |
|---|---|
| `react-native-reanimated` | Animated values, `useSharedValue`, `useAnimatedStyle`, layout animations |
| `react-native-gesture-handler` | Gesture components, `GestureHandlerRootView`, state constants |
| `react-native-safe-area-context` | `SafeAreaProvider`, `useSafeAreaInsets`, `SafeAreaView` |
| `@react-navigation/native` | `NavigationContainer`, `useNavigation`, `useRoute` |
| `@react-native-async-storage/async-storage` | `getItem`, `setItem`, `removeItem`, `clear`, `getAllKeys` |
| `react-native-screens` | `enableScreens`, screen components |
| `expo` | `expo-constants`, `expo-font`, `expo-asset`, `expo-splash-screen`, `expo-linking`, `expo-status-bar` |

Auto-detection means zero additional config for most projects. If you need to restrict which presets are active, pass them explicitly:

```ts
import { defineConfig } from 'vitest/config';
import { reactNative, presets } from 'vitest-native';

export default defineConfig({
  plugins: [
    reactNative({
      presets: [
        presets.reanimated(),
        presets.gestureHandler(),
        presets.safeAreaContext(),
      ],
    }),
  ],
});
```

### Available Presets

| Import | Function |
|---|---|
| `presets.reanimated()` | react-native-reanimated |
| `presets.gestureHandler()` | react-native-gesture-handler |
| `presets.safeAreaContext()` | react-native-safe-area-context |
| `presets.navigation()` | @react-navigation/native |
| `presets.asyncStorage()` | @react-native-async-storage/async-storage |
| `presets.screens()` | react-native-screens |
| `presets.expo()` | Expo modules |

Presets apply under **both** engines: the mock engine and `engine: 'native'` (where they shadow each
library's native runtime — worklets, native modules — exactly as Jest does, while the surrounding tree
renders through real React Native).

### Expo

The `expo` preset shadows the common Expo modules (`expo-constants`, `expo-status-bar`, `expo-font`,
`expo-asset`, `expo-splash-screen`, `expo-linking`) the way `jest-expo` mocks them. A component that
imports those renders under the native engine with no extra setup — there's a gated proof in
`tests-native/expo.test.tsx`. Two honest caveats:

- **Expo modules without a preset** (e.g. `expo-image`, `expo-haptics`) still need a `vi.mock` or a
  custom preset, just as `jest-expo` ships a mock for each. The native engine externalizes them to
  Node, so importing the real native module would fail without a stand-in.
- **Expo SDK trails React Native.** Pin your `react-native` to the version your Expo SDK supports
  (which is within this plugin's validated range), not the newest RN release.

Full Expo-app validation (a real Expo project's suite end-to-end) is on the roadmap; today the
guarantee is the presets above plus standard `vi.mock` for the rest.

---

## Migrating from `vitest-react-native`

Used [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native)
and it broke on a newer Vitest? `vitest-native` is the maintained continuation — same core
architecture (externalize RN, run its real JS under Node, mock only the native boundary). For the
common case it's a config swap:

```diff
- import reactNative from 'vitest-react-native';
- import react from '@vitejs/plugin-react';
+ import { reactNative } from 'vitest-native';
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
-   plugins: [reactNative(), react()],
+   plugins: [reactNative()],
  });
```

Named import, and drop `@vitejs/plugin-react` (vitest-native handles the JSX runtime itself). The
full walkthrough — install, gotchas, what's the same — is in
**[docs/migrating-from-vitest-react-native.md](docs/migrating-from-vitest-react-native.md)**.

---

## Migrating from Jest

vitest-native ships a small compat layer that clears the mechanical Jest-API coupling in an existing
suite (the `jest` global, `@jest/globals`, jest-native's extend-expect):

```ts
// vitest.config.mts
import { reactNative } from 'vitest-native';
import { jestCompatAliases, jestCompatSetup } from 'vitest-native/jest-compat';

export default defineConfig({
  plugins: [reactNative({ engine: 'native' })],
  resolve: { alias: { ...jestCompatAliases() } },
  test: { globals: true, setupFiles: [jestCompatSetup] },
});
```

This is **not** a turnkey drop-in — a real suite still needs a small per-suite cleanup (convert
top-level `jest.mock` → `vi.mock`, RNTL ≥ 12, re-record snapshots once with `-u`). The full recipe,
with a worked real-app example, is in **[docs/migrating-from-jest.md](docs/migrating-from-jest.md)**.

---

## Troubleshooting

**`@react-native/babel-preset not found — using the mock engine`**
You asked for the default (`auto`) engine but the native babel deps aren't installed, so it
fell back to the mock engine. To run real React Native, install them:

```bash
npm i -D @react-native/babel-preset @babel/core
```

To silence the notice and stay on mock deliberately, set `reactNative({ engine: 'mock' })`.

**`vi.mock('some-rn-library')` doesn't take effect (native engine)**
Under `engine: 'native'`, React Native and its native-side libraries are *externalized* to Node,
so they load outside Vite's module graph — and Vitest's mocker only intercepts modules inside that
graph. Your **own** source modules mock normally; the gap is third-party RN-side packages. Options:

- Use a **[preset](#auto-detect-presets)** if one exists (it shadows the library the way Jest does).
- For a pure-JS library shipping untranspiled source, add it to the [`transform`](#plugin-options)
  allowlist so the engine strips its Flow/TS as it loads.
- Or test that boundary on the **mock engine**, where `vi.mock` applies normally.

**`Unexpected token` / Flow syntax errors from a third-party library (native engine)**
The require hook strips Flow/TS from `react-native` and active presets, but not from arbitrary
packages. If a dependency ships untranspiled Flow/TS, add it to the
[`transform`](#plugin-options) allowlist.

**My `babel.config.js` plugin isn't running**
Transforms go through Vite/esbuild, not Babel, so custom Babel plugins don't apply. JSX (automatic
runtime) and RN/preset Flow-stripping are handled for you; for anything else, prefer a Vite plugin
or a preset.

**Snapshots differ after switching from Jest or the mock engine**
Real RN computes host props (e.g. `<Text>`'s `accessible`, `allowFontScaling`) that mocks omit, so
the tree is richer. Re-record once with `npx vitest -u` after migrating.

---

## RNTL Matchers

When `@testing-library/react-native` v12.9 or later is installed, `vitest-native` auto-registers its custom matchers. No manual `extend(matchers)` call or setup file is needed.

The following matchers become available on `expect()`:

| Matcher | Description |
|---|---|
| `toBeVisible()` | Element is visible |
| `toBeEmptyElement()` | Element has no children |
| `toBeEnabled()` | Element is not disabled |
| `toBeDisabled()` | Element is disabled |
| `toHaveTextContent(text)` | Element contains the given text |
| `toHaveProp(name, value?)` | Element has the specified prop |
| `toHaveStyle(style)` | Element has the specified styles |
| `toBeOnTheScreen()` | Element is in the component tree |
| `toContainElement(element)` | Element contains the given child |
| `toHaveAccessibilityState(state)` | Element has the specified accessibility state |
| `toHaveAccessibilityValue(value)` | Element has the specified accessibility value |
| `toBeSelected()` | Element is selected |
| `toBeChecked()` | Element is checked |
| `toBePartiallyChecked()` | Element is partially checked |
| `toBeBusy()` | Element is busy |
| `toBeExpanded()` | Element is expanded |
| `toBeCollapsed()` | Element is collapsed |

```tsx
import { render, screen } from '@testing-library/react-native';
import { View, Text } from 'react-native';

test('greeting is visible with correct style', () => {
  render(
    <View>
      <Text style={{ color: 'red', fontSize: 18 }}>Hello</Text>
    </View>
  );

  const text = screen.getByText('Hello');
  expect(text).toBeVisible();
  expect(text).toHaveStyle({ color: 'red' });
  expect(text).toHaveTextContent('Hello');
});
```

---

## Animated Matchers (Reanimated)

`react-native-reanimated` ships `toHaveAnimatedStyle` and `toHaveAnimatedProps` through its Jest setup, which isn't available under Vitest. `vitest-native` registers Vitest-native equivalents automatically — no `setUpTests()` call or setup file needed.

| Matcher | Description |
|---|---|
| `toHaveAnimatedStyle(style, config?)` | Element's (flattened) style contains the given entries. Pass `{ shouldMatchAllProps: true }` to require an exact match. |
| `toHaveAnimatedProps(props)` | Element's animated props contain the given entries. |

Because the `reanimated` preset resolves `useAnimatedStyle`/`useAnimatedProps` synchronously, the animated values land on the rendered element and these matchers read straight from it:

```tsx
import { render, screen } from '@testing-library/react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

function Skeleton({ visible }: { visible: boolean }) {
  const opacity = useSharedValue(visible ? 1 : 0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID="bone" style={style} />;
}

test('starts with full opacity', () => {
  render(<Skeleton visible />);
  expect(screen.getByTestId('bone')).toHaveAnimatedStyle({ opacity: 1 });
});
```

### Reanimated + Gesture Handler without manual mocks

Both libraries are auto-detected, so a component using a `Gesture` + `GestureDetector` driving an animated style needs no `vi.mock()` calls:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

function Card() {
  const pressed = useSharedValue(false);
  const style = useAnimatedStyle(() => ({ opacity: pressed.value ? 0.5 : 1 }));
  const tap = Gesture.Tap().onStart(() => {
    pressed.value = true;
  });
  return (
    <GestureDetector gesture={tap}>
      <Animated.View testID="card" style={style} />
    </GestureDetector>
  );
}

test('card renders at full opacity', () => {
  render(<Card />);
  expect(screen.getByTestId('card')).toHaveAnimatedStyle({ opacity: 1 });
});
```

> RNGH's `Pressable` is also exported by the preset and mirrors React Native's `Pressable` (including not firing `onPress` when `disabled`), so you can swap `import { Pressable } from 'react-native-gesture-handler'` straight into tests.

### TypeScript

To type the matchers on `expect()`, add the matcher types to your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "types": ["vitest-native/matchers"]
  }
}
```

---

## Snapshot Serializer

A snapshot serializer is auto-registered that produces clean, JSX-like output for React Native components. Instead of deeply nested `ReactTestInstance` objects, snapshots read naturally:

```
<View>
  <Text
    style={
      {
        "fontSize": 18,
      }
    }
  >
    Hello, World
  </Text>
</View>
```

No configuration is required. The serializer is active for all snapshot tests automatically.

---

## Platform Extensions

The plugin resolves platform-specific files following React Native conventions. When `platform` is set to `'ios'` (the default), imports resolve in this order:

1. `./Component.ios.ts`
2. `./Component.native.ts`
3. `./Component.ts`

When `platform` is `'android'`:

1. `./Component.android.ts`
2. `./Component.native.ts`
3. `./Component.ts`

This works for all supported extensions: `.ts`, `.tsx`, `.js`, `.jsx`.

```ts
// vitest.config.ts -- test Android-specific code
export default defineConfig({
  plugins: [reactNative({ platform: 'android' })],
});
```

---

## Asset Stubs

Image, font, video, and audio imports are automatically stubbed. The import resolves to the filename string, so code that passes asset paths through continues to work without errors.

```ts
import logo from './logo.png';
// logo === 'logo.png'
```

Built-in extensions include common formats like `.png`, `.jpg`, `.gif`, `.svg`, `.mp4`, `.ttf`, `.otf`, and more. To add additional extensions:

```ts
reactNative({
  assetExts: ['.lottie', '.m4b'],
})
```

---

## Diagnostics

Enable verbose logging to see exactly what the plugin is doing during configuration and module resolution:

```ts
reactNative({
  diagnostics: true,
})
```

This prints details about which presets were detected, which modules are being mocked, and how imports are resolved. Useful for debugging unexpected behavior.

---

## Requirements

| Dependency | Version |
|---|---|
| `react` | >= 18 |
| `vite` | >= 5 |
| `vitest` | >= 4 |
| `node` | >= 20 |
| `react-native` (native engine) | 0.81–0.84 validated |
| `@react-native/babel-preset` (native engine) | `*` |
| `@testing-library/react-native` (optional) | >= 12 |

---

## License

MIT
