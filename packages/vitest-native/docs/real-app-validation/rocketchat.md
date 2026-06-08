# Real-app validation: migrating Rocket.Chat's existing Jest suite

**Date:** 2026-06-08 · **Branch:** `design/dual-engine` · **Result: 0 → 79 RNTL tests green under `engine: 'native'`.**

This is the second real-app proof, and the harder one. Where the
[react-native-paper run](./README.md) wrote *fresh* tests against a real component
library, this takes a **real, substantial app's existing Jest suite** and runs it
under Vitest with the plugin — the migration scenario that actually matters for
adoption. It's the answer to "can I point vitest-native at my real jest tests?"

## Subject

[`RocketChat/Rocket.Chat.ReactNative`](https://github.com/RocketChat/Rocket.Chat.ReactNative)
(`develop`) — a production chat app. **React Native 0.81.5 / React 19.1**, RNTL 13.2,
`jest-expo`, ~217 test files (57 use `@testing-library/react-native`). Deeply
Jest-coupled: a homegrown `jest.preset.js`, a 379-line `jest.setup.js`, 46
`jest.mock('react-native', …)`-area mocks across the suite, `patch-package`, and a
large native-dependency footprint (Reanimated, Gesture Handler, Navigation, MMKV,
SVG, WebView, Firebase ×3, device-info, expo-modules, …).

## Result

| | Tests | Files |
|---|---|---|
| RNTL suite under `engine: 'native'` | **79 passed** / 92 run | **10 fully green** / 48 |

From a starting point of **0** (the suite would not load at all). The remaining
failures are now per-file / app-specific test wiring, not systemic plugin gaps
(see *Honest remaining gaps*).

## What the plugin handled automatically

The migration drove out — and this run validates — a set of **systemic** fixes that
now ship in the plugin. These are the parts a migrator does **not** have to do by
hand:

| Capability | What it removes |
|---|---|
| **Transitive preset redirect** (Node require/loader hooks) | Reanimated/Gesture Handler/Safe Area/Navigation/Screens/Async Storage are shadowed even when pulled in *transitively* by another lib (e.g. `@gorhom/bottom-sheet` → gesture-handler) — not just on direct app imports. |
| **`jest.mock` auto-hoisting** (`jestMockTransform`) | Top-level `jest.mock(…)` calls apply (Vitest only hoists `vi.mock`). The suite's mocks run unchanged. |
| **Jest CJS interop** for mock factories | `jest.mock('m', () => Component)` and `() => ({ named })`-consumed-as-default resolve the way Jest resolves them. |
| **Automatic JSX runtime** | RN files that use JSX without importing React compile (matches RN's Babel preset). |
| **Extensionless ESM resolution** | Externalized libs shipping bundler-style `import './x'` resolve (e.g. `@expo/vector-icons`, webview). |
| **TS-aware `jest.requireActual`** | `jest.requireActual('./app/Component')` loads app TypeScript synchronously. |
| **Presets**: device-info, mmkv, svg, gesture-handler Buttons | Common native libs shadowed automatically. |
| **`globalThis.expo` shim** | The real `expo-modules-core` JS runs against a stub native global (EventEmitter/NativeModule/modules), unblocking every Expo-modules-based lib. |

## What still needs per-suite setup (honest: not turnkey)

Migrating a suite this coupled is **not** a drop-in. The working config is ~30 lines
and the ported setup is ~400 lines. The setup is dominated by mocks for native
libraries the plugin has **no preset for** — exactly what a Jest user already writes:

- **Config** (`vitest.config.mts`): the `reactNative({ engine: 'native' })` +
  `jestMockTransform()` plugins, `jestCompatAliases()` + `jestCompatSetup`, and the
  asset/CSS `moduleNameMapper` equivalents as `resolve.alias` entries.
- **Ported `jest.setup.js` → `rc-setup.tsx`**: the original setup minus the mocks
  the plugin now covers (async-storage / safe-area / reanimated / gesture-handler
  were deleted — presets handle them), plus mocks for no-preset libs: Firebase,
  Bugsnag, `react-native-localize` (one mock unblocked ~18 files via `app/i18n`),
  Clipboard, file-viewer, incall-manager, expo-av/font/notifications/device/image,
  true-sheet, math-view, keyboard-controller, webview, and a handful of app-internal
  modules (database, search, encryption, CustomIcon). Plus `process.env.EXPO_OS`
  (the native engine doesn't run babel-preset-expo).

A few Jest-isms still need a touch: factories that reference out-of-scope `mock`-
prefixed variables (Jest's Babel plugin allows it; Vitest doesn't) were inlined,
and a couple of mocks that `requireActual` a TS module were simplified.

## Honest remaining gaps (the ~13 failures)

All increasingly per-file / RocketChat-specific, not systemic:

- 2× third-party libs shipping **JSX in a `.js`** entry (need the `transform`
  allowlist or an inline-deps entry).
- 1× `react-native-worklets` imported **directly** (not via Reanimated) — no preset
  yet; 1× a Reanimated `Extrapolation.CLAMP` reached via an untracked path.
- 2× app-internal mock-path mismatches; 2× `useWindowDimensions.mockReturnValue`
  (per-file mock shape); 1× a stubbed hook missing one export.

## Reproduce

```sh
git clone https://github.com/RocketChat/Rocket.Chat.ReactNative
cd Rocket.Chat.ReactNative
pnpm install --ignore-scripts --config.strict-peer-dependencies=false
pnpm add -D --ignore-scripts vitest@^4 vite@^7 /path/to/vitest-native  # built tarball

# Add vitest.config.mts (engine:'native' + jestMockTransform + jest-compat +
# asset aliases) and port jest.setup.js → a vitest setup, dropping the mocks the
# plugin now covers and keeping mocks for no-preset native libs (see above).

pnpm exec vitest run $(grep -rl "@testing-library/react-native" --include="*.test.tsx" app)
# → Test Files 10 passed · Tests 79 passed
```

## Takeaway

A deeply Jest-coupled production app's **existing** RNTL suite runs at a real,
documented pass rate under `engine: 'native'`, and the gap to *turnkey* is now
concentrated in app-specific test wiring rather than plugin capability. Every
systemic blocker this migration hit — transitive presets, jest.mock semantics, JSX
runtime, extensionless ESM, TS requireActual, the Expo runtime — is now fixed in the
plugin and covered by tests. Combined with the [Paper run](./README.md) (fresh tests,
32/32) and the [obytes template](https://github.com/obytes/react-native-template-obytes)
migration (39/40), this is the evidence that vitest-native handles real RN apps —
both new tests and migrated suites.
