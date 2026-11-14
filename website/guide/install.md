# Installation

## Install

::: code-group
```bash [npm]
npm install -D vitest vite vitest-native @testing-library/react-native
```
```bash [yarn]
yarn add -D vitest vite vitest-native @testing-library/react-native
```
```bash [pnpm]
pnpm add -D vitest vite vitest-native @testing-library/react-native
```
```bash [bun]
bun add -d vitest vite vitest-native @testing-library/react-native
```
:::

`vitest` and `vite` are peer dependencies. [`@testing-library/react-native`](https://callstack.github.io/react-native-testing-library/) is optional, but the guides use it. One plugin replaces three — you don't need a separate RN mock library, a JSX plugin, or a jest preset.

## Configure

`npx vitest-native init` writes this config for you (`vitest.config.mts` in a TypeScript project), or add the plugin yourself:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'

export default defineConfig({
  plugins: [reactNative()],
})
```

If anything looks off, `npx vitest-native doctor` checks your versions, engine and presets. The plugin auto-injects its setup file, configures `@testing-library/react-native` if installed, stubs assets, and resolves platform-specific files. No manual `setupFiles`, no `@react-native/jest-preset`, no `transformIgnorePatterns`.

## Requirements

| | Supported |
|---|---|
| Node.js | 22.22.3+ on Node 22, 24.12+ on Node 24, or 26+ |
| Vitest | 5.x (5.1.0 or later recommended) |
| Vite | ^8.0.5 |
| React | 19 or later |
| React Native | 0.86–0.88 |
| Expo SDK | 57 and 58 |
| React Native Testing Library | 13.x or 14.x (optional) |

Use the React version your React Native release requires, and a `@react-native/babel-preset` that matches its minor version. Each Node line starts at the release where Node's in-thread module hooks work; on an older Node the plugin stops at startup with `UNSUPPORTED_NODE`. Vitest 5.0.x runs, but with Vite 8.3.5 or later it can hide a startup error behind "No test files found" ([vitest-dev/vitest#11682](https://github.com/vitest-dev/vitest/issues/11682)), so the plugin warns once at startup below 5.1.0.

The default **`engine: 'native'`** needs `@react-native/babel-preset` and `@babel/core` — these already ship with React Native projects. In an Expo app without `@react-native/babel-preset` the engine uses Expo's own preset instead, which `expo` brings with `@babel/core`, so an Expo app needs nothing extra. The plugin uses them to Flow-strip real React Native, the same toolchain RN already uses.

The opt-in **`engine: 'mock'`** needs no Babel — it's just Vite.

::: tip Optional peer: RNTL
[`@testing-library/react-native`](https://callstack.github.io/react-native-testing-library/) (RNTL 13–14) is an optional peer dependency. If it's installed, the plugin configures it automatically — you don't set `hostComponentNames` yourself. RNTL 14 uses async rendering APIs.
:::

Next: [Quick Start](/guide/quick-start) walks through writing and running your first test.
