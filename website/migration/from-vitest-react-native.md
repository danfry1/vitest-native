# Migrating from vitest-react-native

If you used [`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native) and it stopped working on a newer Vitest, this is the continuation you're looking for.

**The short version:** it's the same idea, maintained. The original plugin and vitest-native's default engine share the same architecture — externalize React Native to Node, strip its Flow types through a require hook, and mock only the thin native boundary (`View` / `Text` / `UIManager` / `NativeModules` / …). The original simply went unmaintained through Vitest's module-runner rewrites (v2 → v3 → v4) and bit-rotted. vitest-native tracks current Vitest and React Native, and a CI matrix gates it across both so it stays alive.

For the common case — render real RN with RNTL, mock your *own* modules with `vi.mock` — migration is a config swap.

## 1. Swap the package

```bash
# remove the old plugin
npm rm vitest-react-native @vitejs/plugin-react

# add this one (+ the babel preset it uses to strip RN's Flow types)
npm i -D vitest-native @react-native/babel-preset @babel/core
```

Keep your existing `vitest`, `vite`, `react`, `react-native`, and `@testing-library/react-native`. Requirements: **Vitest 4.x or 5.x, Vite ^6.4.2, ^7.3.2, or ^8.0.5, the React version required by your RN release, React Native 0.81–0.88 (validated in CI), and RNTL 12–14.** RNTL 14 uses async rendering APIs. vitest-native supports Node 22.22.3+ on Node 22, 24.12+ on Node 24, or 26+.

## 2. Update vitest.config

**Before** (`vitest-react-native`):

```ts
import reactNative from 'vitest-react-native'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [reactNative(), react()],
})
```

**After** (`vitest-native`):

```ts
import { reactNative } from 'vitest-native'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [reactNative()],
})
```

Two changes:

- **Named import** — `import { reactNative }`, not a default import.
- **Drop `@vitejs/plugin-react`** — vitest-native configures the JSX runtime itself (both engines). Adding `plugin-react` alongside it is unnecessary and can double-transform.

That's it. `reactNative()` with no options resolves to the **native engine** (real RN) whenever `@react-native/babel-preset` is installed, which it now is.

## 3. Run

```bash
npx vitest run
```

Your existing tests render against real React Native exactly as before.

## What's the same

- Real RN component rendering via `@testing-library/react-native`.
- `vi.mock()` of **your own** modules (anything in your app's source graph).
- Standard Vitest everything — `expect`, `vi.fn`, coverage, watch, UI.

## What's new (and optional)

- **Native is the zero-config default**, but a fast [**mock engine**](/guide/engines) is one option away — `reactNative({ engine: 'mock' })` — for pure-logic and environment-control tests. A CI-gated cross-check keeps the mock behaviorally honest against real RN.
- [**Presets**](/guide/presets) auto-shadow common native libraries (Reanimated, Gesture Handler, Safe Area, Navigation, …) the way `jest` mocks them — no per-lib wiring.
- A [**hot runtime**](/guide/hot-runtime), opt-in where the run can be bounded (`hotRuntime: 'auto'`), keeps RN warm across files while resetting app/test modules and common process-wide pollution between files. It uses Vitest's custom worker APIs and has [known differences](/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files) from per-file isolation; the default, `hotRuntime: false`, gives each file a fresh worker.

## Gotchas (the margins)

These are inherent to running RN externalized to Node — they applied to the original plugin too:

- **`vi.mock` replaces what your test and app code import, not what a library `require`s.** A library's own import of a mocked package gets the real one. See [what `vi.mock` reaches](/guide/mocking#what-vi-mock-reaches).
- **Files your tests `import` don't go through your `babel.config.js`.** They go through Vite's transform. Packages that ship untranspiled source are mostly detected and compiled automatically; see [untranspiled packages](/guide/mocking#packages-that-ship-untranspiled-source).

If something that worked under the old plugin doesn't here, [open an issue](https://github.com/danfry1/vitest-native/issues) — parity with `vitest-react-native` is a goal, and the cross-check corpus is how we prove it.
