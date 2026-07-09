# Installation

## Install

::: code-group
```bash [npm]
npm install -D vitest-native
```
```bash [yarn]
yarn add -D vitest-native
```
```bash [pnpm]
pnpm add -D vitest-native
```
```bash [bun]
bun add -d vitest-native
```
:::

One package replaces three — you don't need a separate RN mock library, a JSX plugin, or a jest preset.

## Configure

Add the plugin to your Vitest config:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'

export default defineConfig({
  plugins: [reactNative()],
})
```

That's it. The plugin auto-injects its setup file, configures `@testing-library/react-native` if installed, stubs assets, and resolves platform-specific files. No manual `setupFiles`, no `@react-native/jest-preset`, no `transformIgnorePatterns`.

## Requirements

| Requirement | Version |
|---|---|
| **Node.js** | >= 20 |
| **Vitest** | 4.x |
| **Vite** | ^6.4.2, ^7.3.2, or ^8.0.5 |
| **React** | >= 18 |
| **React Native** | 0.81–0.86 validated in CI (native engine) |

The default **`engine: 'native'`** needs `@react-native/babel-preset` and `@babel/core` — these already ship with React Native projects. The plugin uses them to Flow-strip real React Native, the same toolchain RN already uses.

The opt-in **`engine: 'mock'`** needs no Babel — it's just Vite.

::: tip Optional peer: RNTL
[`@testing-library/react-native`](https://callstack.github.io/react-native-testing-library/) (RNTL 12–14) is an optional peer dependency. If it's installed, the plugin configures it automatically — you don't set `hostComponentNames` yourself. RNTL 14 uses async rendering APIs and requires Node 22.13 or 24+.
:::

Next: [Quick Start](/guide/quick-start) walks through writing and running your first test.
