# Quick Start

This walks through writing and running your first React Native test with vitest-native. It assumes you've [installed and configured](/guide/install) the plugin.

## Write a component

<!-- doc-snippet: src/Greeting.tsx -->
```tsx
// Greeting.tsx
import { Text, View } from 'react-native'

export function Greeting({ name }: { name: string }) {
  return (
    <View>
      <Text>Hello, {name}!</Text>
    </View>
  )
}
```

## Write a test

<!-- doc-snippet: src/Greeting.test.tsx -->
```tsx
// Greeting.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { Greeting } from './Greeting'

describe('Greeting', () => {
  it('renders the name', async () => {
    await render(<Greeting name="Ada" />)
    expect(screen.getByText('Hello, Ada!')).toBeTruthy()
  })
})
```

## Run it

```bash
npx vitest run        # one-shot
npx vitest            # watch mode
npx vitest --ui       # the Vitest UI
```

You get Vitest's full toolchain — watch mode, the UI, coverage, and native ESM — for your React Native tests. Add `"test": "vitest"` to your `package.json` scripts to run it as `npm test`.

React Native Testing Library 14 makes `render`, `fireEvent` and `act` async, so the examples here `await` them. On RNTL 12 and 13 `render` and `fireEvent` are synchronous and awaiting them is harmless, so the same tests run on all three.

::: tip Running beside an existing Jest suite
Vitest picks up every `*.test.*` and `*.spec.*` file by default, including the ones Jest still runs. While both runners are in use, point Vitest at the tests you've moved with [`test.include`](https://vitest.dev/config/include), for example `include: ['src/**/*.vitest.test.tsx']`.
:::

## Interactions and queries

RNTL works exactly as you'd expect. Query by text, test ID, or role; fire events; assert with the jest-native matchers (registered automatically):

<!-- doc-snippet: src/press.test.tsx -->
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'

it('handles a press', async () => {
  const onPress = vi.fn()
  await render(
    <Pressable onPress={onPress} accessibilityRole="button">
      <Text>Tap me</Text>
    </Pressable>,
  )

  await fireEvent.press(screen.getByRole('button'))
  expect(onPress).toHaveBeenCalledOnce()
})
```

## Control device state

Use the [test helpers](/guide/helpers) to control dimensions or color scheme inside a test — these work under both engines:

<!-- doc-snippet: src/device-state.test.tsx -->
```tsx
import { setDimensions, setColorScheme, resetAllMocks } from 'vitest-native/helpers'
import { afterEach, it } from 'vitest'

afterEach(() => resetAllMocks())

it('renders the tablet layout', () => {
  setDimensions({ width: 768, height: 1024 })
  // … assertions for the tablet path
})

it('renders in dark mode', () => {
  setColorScheme('dark')
  // … assertions for dark mode
})
```

To test Android-specific behavior, set the platform in config — `reactNative({ platform: 'android' })` — or run both platforms as separate Vitest projects. Under the default `native` engine the platform is fixed when the module graph loads, so there is no per-test switch (`setPlatform()` is [mock-engine-only](/guide/helpers#setplatform-os)).

## Next steps

- [Choosing an Engine](/guide/engines) — when to use `native` vs `mock`.
- [Third-Party Presets](/guide/presets) — Reanimated, Navigation, and friends, auto-detected.
- [Test Helpers](/guide/helpers) — the full helper API.
- Migrating an existing suite? See [From Jest](/migration/from-jest) or [From vitest-react-native](/migration/from-vitest-react-native).
