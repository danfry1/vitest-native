# vitest-native

The definitive Vitest plugin for React Native. One install, zero config.

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

- **Node.js** >= 18
- **Vitest** >= 2
- **Vite** >= 5
- **React** >= 18

## Features

- **Zero config** — Plugin auto-injects setup files and configures RNTL. No manual `setupFiles` needed.
- **Single package** — One install replaces three.
- **No extra dependencies** — No Babel, no Flow transforms, no pirates. Just Vite.
- **100% public API coverage** — Every stable React Native export is mocked.
- **RNTL compatible** — Works with `@testing-library/react-native` automatically.
- **Third-party presets** — Built-in mocks for reanimated, gesture handler, safe area, and navigation.
- **Test helpers** — `setPlatform`, `setDimensions`, `setColorScheme`, `mockNativeModule` for easy state control.
- **TypeScript first** — Full type safety across the entire API.

## How It Works

The plugin does three things automatically:

1. **Module resolution** — Redirects `react-native` imports to virtual modules and resolves platform-specific files (`.ios.ts`, `.android.ts`, `.native.ts`)
2. **Asset stubbing** — Stubs image/font/media imports with their filename, matching React Native's bundler
3. **Setup injection** — Auto-injects a setup file that registers all mocks, sets React Native globals (`__DEV__`, `requestAnimationFrame`, etc.), and configures `@testing-library/react-native` if installed

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
| `presets.navigation()` | `@react-navigation/native` | `NavigationContainer`, `useNavigation`, `useRoute`, `useFocusEffect`, `useIsFocused`, `CommonActions`, `StackActions`, `TabActions`, `DrawerActions`, `Link` |

## API Coverage

vitest-native mocks **100% of React Native's stable public API** (verified against RN 0.84).

### Components (26)

View, Text, TextInput, Image, ScrollView, FlatList, SectionList, VirtualizedList, VirtualizedSectionList, Modal, Pressable, Touchable, TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback, TouchableNativeFeedback, ActivityIndicator, Button, Switch, RefreshControl, StatusBar, SafeAreaView, KeyboardAvoidingView, ImageBackground, InputAccessoryView, DrawerLayoutAndroid, ProgressBarAndroid

**Component instance methods** are supported via refs: TextInput (`focus`, `blur`, `clear`, `isFocused`), ScrollView (`scrollTo`, `scrollToEnd`), FlatList/SectionList (`scrollToIndex`, `scrollToOffset`, `scrollToEnd`, `recordInteraction`).

### APIs (30)

Platform, StyleSheet, Dimensions, Animated, Alert, Linking, Keyboard, AppState, BackHandler, Vibration, PermissionsAndroid, Appearance, PixelRatio, LayoutAnimation, Share, AccessibilityInfo, InteractionManager, PanResponder, ToastAndroid, ActionSheetIOS, LogBox, Easing, I18nManager, DeviceEventEmitter, Clipboard, AppRegistry, Settings, DevSettings, Systrace, PushNotificationIOS

### Animated

Full animation API including `timing`, `spring`, `decay`, `sequence`, `parallel`, `stagger`, `loop`, `delay`, `event`, and arithmetic operators (`add`, `subtract`, `multiply`, `divide`, `modulo`, `diffClamp`). `Animated.View`, `Animated.Text`, `Animated.Image`, `Animated.ScrollView` are real React components (not string literals) compatible with RNTL.

### Hooks (3)

useColorScheme, useWindowDimensions, useAnimatedValue

### Native Internals (8)

NativeModules, TurboModuleRegistry, UIManager, NativeEventEmitter, NativeAppEventEmitter, NativeComponentRegistry, NativeDialogManagerAndroid, requireNativeComponent

### Utilities (7)

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

The plugin auto-configures `@testing-library/react-native` with the correct host component names. If you're having issues:
1. Make sure `@testing-library/react-native` is installed
2. Don't manually configure `hostComponentNames` — the plugin handles it

### Asset imports returning undefined

The plugin stubs common asset extensions (png, jpg, gif, mp4, mp3, ttf, etc.). For custom formats, use `assetExts`:

```ts
reactNative({
  assetExts: ['.lottie', '.m4b'],
})
```

### "Invalid hook call" warnings in test output

If calling `useColorScheme` or `useWindowDimensions` directly outside a component (e.g., in API tests), you'll see a React warning in stderr. The mock handles this gracefully with a try/catch fallback. The test will still pass — the warning is expected.

## Migrating from Jest

### 1. Replace packages

```bash
# Remove Jest + React Native preset
npm uninstall jest @react-native/jest-preset babel-jest @babel/preset-env @babel/preset-react @babel/preset-typescript

# Install Vitest + vitest-native
npm install -D vitest vite vitest-native
```

### 2. Replace config

Delete `jest.config.js` and create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';

export default defineConfig({
  plugins: [reactNative()],
});
```

### 3. Update test files

| Jest | Vitest |
|------|--------|
| `import { jest } from '@jest/globals'` | `import { vi } from 'vitest'` |
| `jest.fn()` | `vi.fn()` |
| `jest.mock('module')` | `vi.mock('module')` |
| `jest.useFakeTimers()` | `vi.useFakeTimers()` |
| `jest.advanceTimersByTime(ms)` | `vi.advanceTimersByTime(ms)` |
| `jest.spyOn(obj, 'method')` | `vi.spyOn(obj, 'method')` |
| `beforeAll` / `afterAll` / etc. | Same — works identically |

### 4. Update scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### 5. Remove Jest setup files

vitest-native auto-injects setup for React Native globals and `@testing-library/react-native` configuration. You can delete:
- `jest.setup.js` / `jest.setup.ts`
- Any `setupFiles` / `setupFilesAfterSetup` entries
- `@react-native/jest-preset` references
- Babel config (if only used for Jest)

## Why Not Jest?

Jest with `@react-native/jest-preset` works but comes with trade-offs:

- Babel transforms are slow compared to Vite's pipeline
- Jest's module resolution doesn't support Vite's plugin ecosystem
- No HMR or watch-mode optimizations that Vite provides
- Configuration is complex and brittle across RN versions

vitest-native gives you the speed and DX of Vitest with full React Native compatibility.

## Contributing

```bash
bun install
bun run --filter vitest-native build
bun run --filter vitest-native test
```

## License

MIT
