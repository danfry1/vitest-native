# vitest-native

A Vitest plugin for React Native. One install, zero config.

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
- [RNTL Matchers](#rntl-matchers)
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

- **One line of config.** Add the plugin and every mock, resolver, and setup file is handled for you.
- **Vitest-native speed.** Vitest runs on Vite's dev server -- no cold starts, native ESM, and fast HMR-driven watch mode.
- **Comprehensive mocks.** 21 components and 25+ APIs are mocked out of the box, with full TypeScript types.
- **Auto-detect presets.** The plugin scans your `node_modules` and automatically mocks third-party libraries like Reanimated, Gesture Handler, and Expo modules.
- **Test helpers.** Switch platform, dimensions, and color scheme in a single function call -- no manual mock wiring.

If you are already using Vitest for your web projects, `vitest-native` lets you use the same tool, the same config patterns, and the same test runner for React Native.

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
| `platform` | `'ios' \| 'android'` | `'ios'` | Target platform. Controls `Platform.OS`, version defaults, and file extension resolution. |
| `presets` | `Preset[]` | auto-detect | Built-in library presets. When omitted, installed packages are detected automatically. Only built-in presets are supported; for custom module mocking, use `vi.mock()` in a setup file. |
| `mocks` | `Record<string, any>` | `{}` | JSON-serializable overrides merged into the `react-native` module mock. Function values are not supported; use `vi.mock()` in a setup file for function-based overrides. |
| `diagnostics` | `boolean` | `false` | Log plugin activity to the console for debugging. |
| `assetExts` | `string[]` | `[]` | Additional file extensions to stub as asset imports (beyond the built-in set). |

---

## Mocked Components and APIs

The plugin provides a complete mock of the `react-native` module. Every component renders as a named host element (making snapshots readable), and every API function is a Vitest `vi.fn()` spy.

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

vitest-native ports tests directly from React Native's own test suite to validate mock behavioral parity. These tests are the same assertions Meta uses to verify React Native itself:

- **Easing** — all 24 easing curve tests including sample data for quad, cubic, sin, exp, circle, and back
- **Bezier** — 9 cubic bezier mathematical property tests (symmetry, projection, boundary conditions)
- **flattenStyle** — 12 style merging tests covering override precedence, reference identity, and recursive flattening
- **processColor** — 9 color format conversion tests for named colors, RGB, RGBA, HSL, HSLA, and hex
- **Interpolation** — 5 numeric range mapping tests for default, scaled, and multi-segment interpolation

59 assertions ported from RN's own test suite, all passing.

---

## Test Helpers

Import helpers from `vitest-native/helpers` to control mock state during tests.

```ts
import {
  setPlatform,
  setDimensions,
  setColorScheme,
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

Reset all mocks to their default state. Restores platform to iOS, dimensions to iPhone 14 Pro defaults (390x844), color scheme to `'light'`, clears all mock call history, and undoes any `mockNativeModule` calls.

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
| `@testing-library/react-native` (optional) | >= 12 |

---

## License

MIT
