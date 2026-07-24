# Migrating from Jest

**Honest expectation first:** this is **not a turnkey drop-in.** Real React Native Jest suites couple to Jest at several levels (the `jest` global, `@jest/globals`, `jest.mock('react-native')`, `@react-native/jest-preset`, jest-native matchers, recorded snapshots). The [`vitest-native/jest-compat`](/guide/jest-compat) layer clears the *API coupling* mechanically; the rest is a small, well-defined per-suite cleanup.

This guide is informed by migration runs against production apps, but support claims come from
minimal package-owned tests. External apps include custom Jest setup and migration shims, so their
pass counts are observations rather than capability verdicts. See the
[validation model](/guide/validation-model).

::: tip Recommended path: adopt incrementally
Point vitest-native at *new* tests (zero migration cost, better DX, real-RN fidelity when you want it) while your existing Jest suite keeps running on Jest. Migrate older tests as you touch them, rather than all at once.
:::

## 1. The jest-compat layer (clears API coupling)

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from 'vitest-native/jest-compat'

export default defineConfig({
  plugins: [reactNative({ engine: 'native' }), jestMockTransform()], // or engine: 'mock'
  resolve: {
    dedupe: ['react', 'react-test-renderer', 'react-is'],
    alias: { ...jestCompatAliases() },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [jestCompatSetup],
  },
})
```

What each piece clears:

| Piece | Clears |
|---|---|
| `jestCompatSetup` (a setup file) | Installs a `jest` global backed by Vitest's `vi`, plus the sync `jest.requireActual` / `jest.requireMock` that Vitest only ships as the async `vi.importActual`. |
| `jestMockTransform()` (a plugin) | Rewrites top-level `jest.mock(...)` to a **hoisted** `vi.mock(...)` so it actually applies — see [Top-level jest.mock](#top-level-jest-mock). The single biggest mechanical blocker, automated. |
| `jestCompatAliases()` → `@jest/globals` | Redirects `@jest/globals` (imported by **@testing-library/react-native < 12**) to a shim re-exporting Vitest's globals. |
| `jestCompatAliases()` → `@testing-library/jest-native/extend-expect` | No-ops it — vitest-native already registers the jest-native matchers (`toHaveStyle`, `toBeVisible`, …). |

After this, `jest.fn`, `jest.spyOn`, `jest.useFakeTimers`, `jest.requireActual`, and top-level `jest.mock` / `jest.unmock` / `jest.doMock` calls all work unchanged. See the [jest-compat reference](/guide/jest-compat) for details.

## 2. Per-suite cleanup still required

These are the things the compat layer **cannot** do for you. Each is small and mechanical.

### Top-level jest.mock

Vitest only **hoists** mock calls made on the `vi` / `vitest` identifier. A top-level `jest.mock('react-native', factory)` would otherwise run *after* imports and silently not apply.

**`jestMockTransform()` (section 1) handles this for you** — it rewrites top-level `jest.mock` / `jest.unmock` / `jest.doMock` / `jest.doUnmock` to the hoisted `vi.*` form, and runs each `mock`/`doMock` factory's return through **Jest's CommonJS interop** so the two most common Jest manual-mock shapes resolve the way they do under Jest:

```ts
jest.mock('./Icon', () => () => null)         // function factory → usable as `import Icon from`
jest.mock('./api', () => ({ get: vi.fn() }))  // named-only → `import api from` gets the object
```

(Jest treats a factory return as `module.exports`; Vitest treats it as an ES namespace. The wrapper bridges that. A factory already returning an ES shape — `__esModule` or an explicit `default` — is left as-is.) So you can leave existing `jest.mock(...)` calls unchanged. It keys on the literal `jest.mock` member form, not `jest` aliased to another local name.

…and in most cases you can **delete** third-party native-lib mocks entirely — see below.

### Upgrade RNTL to 12–14 (recommended)

The `@jest/globals` alias unblocks RNTL < 12, but **upgrading to `@testing-library/react-native@^12` is the cleaner fix** (12 dropped the `@jest/globals` dependency). vitest-native supports RNTL 12–14. RNTL 14 requires Node 22.13 or 24+ and makes rendering APIs async, so await `render` and other APIs as described in its migration guide.

### Delete third-party native-lib mocks

You do **not** need `jest.mock('react-native-reanimated', …)`, safe-area's `jest/mock`, gesture-handler's jestSetup, etc. vitest-native **auto-detects** installed third-party libraries and shadows their native runtimes with built-in [presets](/guide/presets), under **both** engines. Just have the package installed; delete the manual mock. (Reanimated, Gesture Handler, Safe Area, Navigation, Screens, AsyncStorage, Expo are covered out of the box.)

### Re-record snapshots

This is the most common surprise. Under `engine: 'native'`, real React Native renders **real host component names** (`RCTText`, `RCTView`, `RCTScrollView`), whereas `@react-native/jest-preset` snapshots show mock names (`Text`, `View`). Existing snapshots will mismatch on names only. Run once with `-u` to re-record; the rendered structure is otherwise equivalent. (In the Paper run, every own-test passed after a single `-u`.)

```bash
vitest run -u
```

::: tip
Prefer explicit queries (`getByText`, `getByTestId`, `getByRole`) over large snapshots — they're robust across the engine's real host names and far easier to review.
:::

### Drop jest-preset and transform config

Drop `@react-native/jest-preset` and `transform` / `transformIgnorePatterns` — those are Jest/Metro config. vitest-native handles RN + third-party transformation itself (`engine: 'native'` transforms real RN in Node's loader hooks; the mock engine virtualizes RN). For *run-real pure-JS* third-party libs under the native engine, use the plugin's [`transform`](/guide/plugin-options#transform) allowlist instead of `transformIgnorePatterns`.

The one case that needs a manual `transform` entry: a library that ships **untranspiled JSX in `.js` files** (its `package.json` `"react-native"`/`"module"` field points at `src/`, relying on Metro to transform it). Under the native engine such a lib is external to the Vite graph, and you'll see:

```
Failed to parse source for import analysis because the content contains invalid JS
syntax. If you are using JSX, make sure to name the file with the .jsx or .tsx extension.
  File: node_modules/<lib>/src/Something.js
```

The error names the offending file — add that package to `transform` so vitest-native transforms it:

```ts
reactNative({ engine: 'native', transform: ['<lib>'] })
```

This is the direct replacement for having listed the lib in `transformIgnorePatterns` under Jest. It's also required when a `vi.mock('<lib>')` must intercept an otherwise-externalized library — `vi.mock` only applies to modules pulled into the Vite graph.

### Move jest config options to Vitest

`jest.config.js` keys (`setupFilesAfterEnv`, `moduleNameMapper`, `testEnvironment`, etc.) move to the Vitest config: `setupFiles`, `resolve.alias`, `test.environment: 'node'`. `jest.setTimeout(ms)` is a no-op under the shim (use `test.testTimeout` in config or per-test `{ timeout }`).

## 3. Known limits — assertions coupled to Jest's mocks

A minority of tests assert on **Jest's React Native mock internals** rather than on rendered behavior. The native engine runs *real* React Native, so these can't be reproduced without re-mocking RN internally (which would defeat the point). They're worth recognizing up front so you can rewrite or skip them rather than chase them. In our own runs these were concentrated in **component libraries** (which test RN internals directly); ordinary app suites hit few or none.

| Jest-coupled pattern | Why it doesn't port | What to do |
|---|---|---|
| `jest.spyOn(View.prototype, 'measure')` / `'measureInWindow'` | Jest mocks `View` as a class with methods on its prototype; real RN's `View` is a `forwardRef` with no such prototype, so the spy target is `undefined`. | Rewrite to drive layout via `onLayout` / `fireEvent`, or accept as a known-incompatible assertion. |
| `jest.mock('react-native/Libraries/Utilities/Appearance')` (and other deep RN-internal submodules), then `jest.spyOn` them | Under the native engine RN is externalized/resident, so a mock of an internal submodule never intercepts the module the app already imported. | Prefer the public API (e.g. `Appearance` from `react-native`); vitest-native provides controllable boundaries for common ones. |
| `image.props.source.uri` / raw `source`-shape assertions | Real RN normalizes the `source` prop (an object like `{ uri }`), so tests reading the raw mock shape see a different value. Native = real RN = ground truth. | Assert on behavior (what renders) rather than the internal prop shape. |
| `jest.mock('react-native', …)` **nested inside** `beforeAll`/`describe` callbacks | Jest does **not** hoist a `jest.mock` inside a callback, so under Jest it's effectively inert; vitest-native applies mocks more consistently, which can expose a mock that was silently doing nothing. | Move the mock to top level and make its override valid, or drop it if it was a no-op. |

The `jest.requireActual('react-native')` clone-and-override pattern (`const RN = jest.requireActual('react-native'); RN.Platform = {…}; return RN`) **is** supported — RN's module is writable under the compat layer.

::: warning Expo-core-coupled suites
A test that imports **Expo core** pulls in Expo's dev-server/init plumbing (async-require message socket, dev tools), which expects a running Metro connection. Deeply Expo-coupled files may not collect under the native engine without additional setup — this is the documented not-turnkey case. Suites that use Expo *modules* (via the auto-detected `expo` preset) are unaffected; it's Expo *core* import chains that hit this.
:::

## 4. Suggested migration recipe

1. Add the jest-compat config (section 1). Upgrade RNTL to a supported 12–14 release.
2. Delete manual third-party native-lib mocks and `@react-native/jest-preset`.
3. Convert any **top-level** `jest.mock(...)` to `vi.mock(...)`; leave runtime `jest.*` as-is (or rely on `jestMockTransform()`).
4. Add any JSX-in-`.js` third-party libs to `transform` as their parse errors surface (section 2).
5. Run `vitest run -u` once to re-record snapshots, then `vitest run` to confirm green.
6. Triage remaining failures — a missing query update, a suite-specific mock, or a known Jest-mock-coupled assertion (section 3).

## 5. What "done" looks like

A migrated suite runs under Vitest with: the jest-compat aliases + setup, RNTL 12–14, no manual third-party native mocks, top-level mocks converted, and snapshots re-recorded. You get Vitest's speed/watch/UI while keeping `engine: 'native'` real-RN fidelity (or `engine: 'mock'` for the fast path). The compat layer is intentionally small — it removes the mechanical Jest coupling so the only work left is the genuinely suite-specific bits.
