# Test Helpers

vitest-native ships a small set of helpers for controlling device state inside a test — dimensions, color scheme, safe-area insets, and native modules. Import them from `vitest-native/helpers`.

```ts
import {
  setDimensions,
  setColorScheme,
  setInsets,
  mockNativeModule,
  resetAllMocks,
} from 'vitest-native/helpers'
```

All helpers work under both engines, with one exception: `setPlatform` is mock-engine-only (see below).

## `setPlatform(os)`

::: warning Mock engine only
Under the default `native` engine, `setPlatform()` throws: the platform is baked in when the real React Native module graph loads (`Platform.ios`/`Platform.android` and every `.ios.ts`/`.android.ts` file have already been selected). Set it in config instead — `reactNative({ platform: 'android' })` — or run both platforms as separate Vitest projects.
:::

Switch the platform for a test (mock engine). Affects `Platform.OS` and platform-specific behavior.

```ts
setPlatform('android')
```

## `setDimensions(dimensions)`

Override the screen dimensions reported by `Dimensions` and `useWindowDimensions`.

```ts
setDimensions({ width: 768, height: 1024 })
```

## `setColorScheme(scheme)`

Switch the color scheme reported by `Appearance` and `useColorScheme`.

```ts
setColorScheme('dark')
```

## `setInsets(insets)`

Override the safe-area insets reported by the auto-detected `react-native-safe-area-context` preset (`useSafeAreaInsets`, `SafeAreaProvider`). No-op when the preset isn't active.

```ts
setInsets({ top: 59, bottom: 34, left: 0, right: 0 })
```

## `mockNativeModule(name, impl)`

Provide a mock implementation for a native module.

```ts
mockNativeModule('MyNativeModule', {
  getValue: () => Promise.resolve(42),
  doSomething: () => {},
})
```

## `resetAllMocks()`

Reset everything back to defaults — iOS, 390×844, light mode — and clear all spies. Call it in an `afterEach` to keep tests isolated:

```ts
import { afterEach } from 'vitest'
import { resetAllMocks } from 'vitest-native/helpers'

afterEach(() => resetAllMocks())
```

This also resets the Keyboard and AppState helper state described below.

## Keyboard & AppState helpers

The Keyboard and AppState mocks include internal helpers for simulating state changes, useful for testing listeners:

```ts
import { Keyboard, AppState } from 'react-native'

// Simulate keyboard show/hide (fires keyboardDidShow / keyboardDidHide listeners)
;(Keyboard as any)._show(336) // height in pixels
;(Keyboard as any)._hide()

// Simulate app state change (fires 'change' listeners)
;(AppState as any)._setState('background')
```

These are reset automatically by `resetAllMocks()`.

Next: [jest-compat Layer](/guide/jest-compat) or the [API Coverage](/api/coverage) reference.
