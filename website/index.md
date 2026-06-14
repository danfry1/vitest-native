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
    details: The native engine runs RN's real JavaScript and mocks only the thin native boundary — the same modules Jest's preset mocks. Higher fidelity for accessibility, RN-API behavior, and integration, with no mock drift.
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

vitest-native is the only React Native test runner that lets you **choose the fidelity each suite needs**:

|  | `engine: 'native'` *(default)* | `engine: 'mock'` |
|---|---|---|
| What runs | **Real React Native** JS | Fast pure-JS reimplementation |
| Mocks | Only the native boundary | All of React Native |
| Best for | Fidelity, integration, accessibility, avoiding mock drift | Pure-logic suites, environment control, max determinism |
| Babel | Needs `@react-native/babel-preset` | None — just Vite |

Both engines share the same test API (RNTL, the helpers, the presets). A CI-gated [cross-check](/guide/comparison) keeps the mock behaviorally honest against real RN.

## How it compares to Jest

Jest with `@react-native/jest-preset` is the React Native standard and works well. Reach for vitest-native when you value:

- **Fidelity choice** — Jest always mocks React Native. vitest-native lets you run *real* RN when a test needs true behavior, or a fast mock when it doesn't. This is the differentiator nothing else offers.
- **DX** — Vitest's watch mode, UI, and native ESM tooling.
- **Unification** — one runner if you also test web or server code with Vitest.

It is **not** primarily a speed play — choose it for the fidelity option and DX. [Read the full comparison →](/guide/comparison)

## Validated on real apps

The native engine is validated against real apps — **react-native-paper** (32/32 fresh tests), the **obytes template** (39/40), and **Rocket.Chat** — across React Native 0.81–0.84, with a CI-gated behavioral cross-check against real RN.

> **Beta.** Some APIs may still shift before 1.0. Maintained successor to [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native) — same core idea, rebuilt for modern Vitest (4+).

[Get started →](/guide/)
