---
layout: home
title: vitest-native — Test React Native as it ships
titleTemplate: false
hero:
  name: A Vitest plugin for React Native and Expo
  text: Test React Native as it ships.
  tagline: Your components run React Native's real JavaScript, and only the native side is mocked.
  actions:
    - theme: brand
      text: Get started
      link: /guide/install
    - theme: alt
      text: On Jest today?
      link: /migration/from-jest
---

<FrontDoors />

## What runs in your tests

Jest's React Native preset also runs React Native's JavaScript, but it swaps the core components for stand-ins. vitest-native mocks a layer lower, so `View`, `Text` and `ScrollView` run as they ship.

| | Jest + React Native preset | vitest-native |
|---|---|---|
| Core components (`View`, `Text`, `ScrollView`, …) | Stand-ins | Real |
| Native modules and host components | Mocked | Mocked |
| Rendered host names | `View`, `Text` | `RCTView`, `RCTText` |

[Where each one draws the line →](/guide/comparison#where-the-mock-boundary-sits)

A second engine, `engine: 'mock'`, runs without React Native at all, for pure-logic suites. [Choosing an engine →](/guide/engines)

## A first test

`npx vitest-native init` writes the config, or add the plugin yourself:

```ts [vitest.config.ts]
import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'

export default defineConfig({
  plugins: [reactNative()],
})
```

```tsx [Greeting.test.tsx]
import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { Greeting } from './Greeting'

it('renders the name', async () => {
  await render(<Greeting name="Ada" />)
  expect(screen.getByText('Hello, Ada!')).toBeTruthy()
})
```

Run it with `npx vitest`. The plugin sets up React Native Testing Library, assets and platform files, so there is no `setupFiles`, Jest preset or `transformIgnorePatterns` to write. [Quick start →](/guide/quick-start)

## How it's checked

- **Against real React Native.** The same probes run under the mock engine and under real React Native on every supported release, and any difference fails CI. [Fidelity report →](/guide/fidelity)
- **Against known bugs.** Each bug in the project's [bug museum](https://github.com/danfry1/vitest-native/tree/main/packages/vitest-native/validation/bug-museum) is a runnable reproduction that fails on a build that has the bug.
- **Against your own suite.** `npx vitest-native compare` runs your Jest and your Vitest, and lists every test that passes under Jest and not under Vitest. [compare →](/guide/cli#compare)

Pinned public apps are run too, as observations rather than evidence of capability. [Validation model →](/guide/validation-model)

## When to consider alternatives

- **Your Jest suite is fast and you're happy with it.** vitest-native is not mainly a speed play. The reasons to switch are what runs in your tests and Vitest's tooling. [Comparison →](/guide/comparison)
- **A large, Jest-coupled suite moves in steps, not at once.** `compare` shows how far there is to go, and both runners can run side by side. [Migrating from Jest →](/migration/from-jest)
- **It's pre-1.0.** Some options may still change before 1.0.

Maintained successor to [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native).
