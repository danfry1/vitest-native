# Example App

A realistic React Native project that demonstrates **both vitest-native engines
in one `vitest run`** — each engine on the kind of test it's best at.

```bash
bun run --filter '@vitest-native/example' test
```

You'll see two projects in the output, `native` and `mock`:

```
 ✓  native  __tests__/native/FeedList.test.tsx (14 tests)
 ✓  mock    __tests__/mock/apis.test.ts (158 tests)
```

## The two engines, side by side

### `native/` — the zero-config default

These run against **real React Native**. This is what you reach for most of the
time: render a component, query it, fire events, assert on the result. No mocks
of RN itself — the same JS that ships in your app.

| File | What it shows |
|------|---------------|
| `basic.test.ts` | Minimal smoke test — render a `View` |
| `hooks.test.ts` | A custom hook (`useDimensions`) inside a rendered component |
| `Greeting.test.tsx` | Component rendering + RNTL queries |
| `FeedList.test.tsx` | `FlatList`/`SectionList`, headers, empty state, press + pull-to-refresh events |

### `mock/` — the opt-in escape hatch (`engine: 'mock'`)

A fast, deterministic JS reimplementation of RN. Reach for it when you want to
**drive the environment** (flip `Platform.OS`, resize the screen, toggle color
scheme via `vitest-native/helpers`) or **spy on native methods** — things that
are awkward or impossible against real RN in Node.

| File | What it shows |
|------|---------------|
| `apis.test.ts` | Platform, Dimensions, StyleSheet, Animated, Alert, Keyboard, Linking, Modal, Appearance, Image, Share, and more |
| `ProfileScreen.test.tsx` | A full screen across platforms, dark mode, and screen sizes — driven with `setPlatform`/`setDimensions`/`setColorScheme` |
| `components.test.tsx` | Every core RN component renders, with spy-able imperative refs |

## How it's wired

[`vitest.config.ts`](./vitest.config.ts) defines two Vitest projects — one with
`reactNative()` (native, the default) and one with `reactNative({ engine: 'mock' })`
— each scoped to its own folder. That's all it takes to run both in a single command.
