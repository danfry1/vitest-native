---
layout: home
title: vitest-native — Test React Native with Vitest
titleTemplate: false
hero:
  name: vitest-native
  text: Test React Native with Vitest.
  tagline: Run your tests against real React Native — the same JavaScript that ships in your app — mocking only the native-module boundary. One plugin, two engines, zero config.
  image:
    src: /favicon.svg
    alt: vitest-native
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: Quick Start
      link: /guide/quick-start
    - theme: alt
      text: GitHub
      link: https://github.com/danfry1/vitest-native
features:
  - title: Real React Native by default
    details: The native engine runs RN's real JavaScript and mocks only the thin native boundary — native modules and the host-component registry, not the View/Text component JS. Jest's preset mocks more, so the native engine has higher fidelity for accessibility, RN-API behavior, and integration, with no mock drift.
  - title: A fast mock engine, one flag away
    details: engine "mock" is a zero-dependency pure-JS reimplementation of React Native. Reach for it when you want maximum determinism and no RN at all — pure-logic suites, environment control.
  - title: Zero config
    details: One plugin auto-injects setup files, configures @testing-library/react-native, stubs assets, and resolves platform-specific files. No manual setupFiles, no jest-preset, no transformIgnorePatterns.
  - title: Presets for the ecosystem
    details: Reanimated, Gesture Handler, Safe Area, Navigation, Screens, AsyncStorage, MMKV, SVG, WebView, Device Info, and Expo are auto-detected and shadowed — under both engines. Delete your manual native-lib mocks.
  - title: One runner across your codebase
    details: Already using Vitest for web or server code? Get Vitest's watch mode, UI, and native ESM tooling for your React Native tests too. One runner, one config language.
  - title: Adopt incrementally
    details: Point vitest-native at new tests while your existing Jest suite keeps running. A jest-compat layer clears the mechanical Jest-API coupling so you can migrate older tests as you touch them.
---

## Zero config to first test

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'

export default defineConfig({
  plugins: [reactNative()],
})
```

```tsx
// MyComponent.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { MyComponent } from './MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Hello" />)
    expect(screen.getByText('Hello')).toBeTruthy()
  })
})
```

`reactNative()` with no options resolves to the **native engine** — real React Native JS, mocking only the native boundary — whenever your project's Babel preset is present (i.e. any real RN app). No further setup.

## Two engines, one plugin

vitest-native lets you **choose the fidelity each suite needs** — real React Native, or a fast mock — from one plugin:

|  | `engine: 'native'` *(default)* | `engine: 'mock'` |
|---|---|---|
| What runs | **Real React Native** JS | Fast pure-JS reimplementation |
| Mocks | Only the native boundary | All of React Native |
| Best for | Fidelity, integration, accessibility, avoiding mock drift | Pure-logic suites, environment control, max determinism |
| Babel | Needs `@react-native/babel-preset` | None — just Vite |

Both engines share the same test API (RNTL, the helpers, the presets). A CI-gated [cross-check](/guide/comparison) keeps the mock behaviorally honest against real RN.

## How it compares to Jest

Jest with `@react-native/jest-preset` is the React Native standard and works well. Reach for vitest-native when you value:

- **Higher-fidelity option** — Jest's RN preset and vitest-native both run real RN JS and mock the native side, but Jest mocks more (it swaps RN's core components and a few APIs for passthrough stand-ins). vitest-native's `engine: 'native'` mocks only the deeper native boundary, so your tests run RN's *real* component JS — or drop to a fast full mock when you don't need that. [How the boundaries differ →](/guide/comparison#where-the-mock-boundary-sits)
- **DX** — Vitest's watch mode, UI, and native ESM tooling.
- **Unification** — one runner if you also test web or server code with Vitest.

It is **not** primarily a speed play — choose it for the fidelity option and DX. [Read the full comparison →](/guide/comparison)

## How it's verified

The reproducible guarantee is a **CI-gated behavioral cross-check**: 56 probes run the same assertions under the mock engine **and** real React Native across React Native 0.81–0.85, and any divergence fails the build. Anyone can run it (`bun run crosscheck`). On top of that, the full CI gate runs lint, typecheck, build, and the mock + native + hot suites across an OS × Node matrix.

We've also run real apps' own test suites under the native engine. **react-native-paper**'s suite passes **602 of 734 tests (~82%)** with just a config swap + an RNTL version bump — the remaining failures are tests coupled to Jest's RN-mock internals (e.g. `View.prototype.measure` spies, a `jest.mock('react-native')` Animated override), not vitest-native bugs. It's reproducible: see [**vitest-native-bakeoffs**](https://github.com/danfry1/vitest-native-bakeoffs). We've also migrated existing Jest suites from the obytes template and Rocket.Chat in local testing.

> **Beta.** Some APIs may still shift before 1.0. Maintained successor to [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native) — same core idea, rebuilt for modern Vitest (v4).

[Get started →](/guide/)
