# Migrating an existing Jest suite to vitest-native

**Honest expectation first:** this is **not a turnkey drop-in.** Real React Native Jest suites
couple to Jest at several levels (the `jest` global, `@jest/globals`, `jest.mock('react-native')`,
`@react-native/jest-preset`, jest-native matchers, recorded snapshots). The `vitest-native/jest-compat`
layer clears the *API coupling* mechanically; the rest is a small, well-defined per-suite cleanup.

This guide is informed by migration runs against production apps, but support claims come from
minimal package-owned tests. External apps include custom Jest setup and migration shims, so their
pass counts are observations rather than capability verdicts.

---

## 1. The jest-compat layer (clears API coupling)

```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

export default defineConfig({
  plugins: [reactNative({ engine: "native" }), jestMockTransform()], // or engine: "mock"
  resolve: {
    dedupe: ["react", "react-test-renderer", "react-is"],
    alias: { ...jestCompatAliases() },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: [jestCompatSetup],
  },
});
```

What each piece does:

| Piece | Clears |
|---|---|
| `jestCompatSetup` (a setup file) | Installs a `jest` global backed by Vitest's `vi`, plus the sync `jest.requireActual` / `jest.requireMock` that Vitest only ships as the async `vi.importActual`. |
| `jestMockTransform()` (a plugin) | Rewrites top-level `jest.mock(...)` to a **hoisted** `vi.mock(...)` so it actually applies — see 2a. The single biggest mechanical blocker, automated. |
| `jestCompatAliases()` → `@jest/globals` | Redirects `@jest/globals` (imported by **@testing-library/react-native < 12**) to a shim re-exporting Vitest's globals. |
| `jestCompatAliases()` → `@testing-library/jest-native/extend-expect` | No-ops it — vitest-native already registers the jest-native matchers (`toHaveStyle`, `toBeVisible`, …). |

After this, `jest.fn`, `jest.spyOn`, `jest.useFakeTimers`, `jest.requireActual`, and top-level
`jest.mock` / `jest.unmock` / `jest.doMock` calls all work unchanged.

---

## 2. Per-suite cleanup still required

These are the things the compat layer **cannot** do for you. Each is small and mechanical.

### 2a. Top-level `jest.mock(...)` — automated by `jestMockTransform()`
Vitest only **hoists** mock calls made on the `vi` / `vitest` identifier. A top-level
`jest.mock('react-native', factory)` would otherwise run *after* imports and silently not apply.

**`jestMockTransform()` (section 1) handles this for you** — it rewrites top-level
`jest.mock` / `jest.unmock` / `jest.doMock` / `jest.doUnmock` to the hoisted `vi.*` form, and
runs each `mock`/`doMock` factory's return through **Jest's CommonJS interop** so the two most
common Jest manual-mock shapes resolve the way they do under Jest:

```ts
jest.mock('./Icon', () => () => null);        // function factory → usable as `import Icon from`
jest.mock('./api', () => ({ get: vi.fn() }));  // named-only → `import api from` gets the object
```

(Jest treats a factory return as `module.exports`; Vitest treats it as an ES namespace. The
wrapper bridges that. A factory already returning an ES shape — `__esModule` or an explicit
`default` — is left as-is.) So you can leave existing `jest.mock(...)` calls unchanged. It keys
on the literal `jest.mock` member form, not `jest` aliased to another local name.

…and in most cases you can **delete** third-party native-lib mocks entirely — see 2c.

### 2b. Upgrade RNTL to 12–14 (recommended)
The `@jest/globals` alias unblocks RNTL < 12, but **upgrading to `@testing-library/react-native@^12`
is the cleaner fix** (12 dropped the `@jest/globals` dependency). vitest-native supports RNTL
12–14. RNTL 14 requires Node 22.13 or 24+ and makes rendering APIs async, so await `render` and
other APIs as described in its migration guide.

### 2c. Delete third-party native-lib mocks — they're automatic now
You do **not** need `jest.mock('react-native-reanimated', …)`, safe-area's `jest/mock`,
gesture-handler's jestSetup, etc. vitest-native **auto-detects** installed third-party libraries and
shadows their native runtimes with built-in presets, under **both** engines. Just have the package
installed; delete the manual mock. (Reanimated, Gesture Handler, Safe Area, Navigation, Screens,
AsyncStorage, Expo are covered out of the box. Validated under the native engine —
`tests-native/third-party-stack.test.tsx`.)

### 2d. Re-record snapshots (`vitest -u`)
This is the most common surprise. Under `engine: 'native'`, real React Native renders **real host
component names** (`RCTText`, `RCTView`, `RCTScrollView`), whereas `@react-native/jest-preset`
snapshots show mock names (`Text`, `View`). Existing snapshots will mismatch on names only. Run once
with `-u` to re-record; the rendered structure is otherwise equivalent. (In the Paper run, every
own-test passed after a single `-u`.)

> Tip: prefer explicit queries (`getByText`, `getByTestId`, `getByRole`) over large snapshots —
> they're robust across the engine's real host names and far easier to review.

### 2e. Drop `@react-native/jest-preset` and `transform`/`transformIgnorePatterns`
Those are Jest/Metro config. vitest-native handles RN + third-party transformation itself
(`engine: 'native'` transforms real RN in Node's loader hooks; the mock engine virtualizes RN).
For *run-real pure-JS* third-party libs under the native engine, use the plugin's `transform: [...]`
allowlist instead of `transformIgnorePatterns`.

One case needs a manual `transform` entry: a library shipping **untranspiled JSX in `.js` files**
(its `package.json` `"react-native"`/`"module"` field points at `src/`). Under the native engine
it's external to the Vite graph, so you'll see `Failed to parse source for import analysis … If you
are using JSX, make sure to name the file with the .jsx or .tsx extension. File: node_modules/<lib>/…`.
The error names the file — add that package: `reactNative({ engine: 'native', transform: ['<lib>'] })`.
Same entry is needed when a `vi.mock('<lib>')` must intercept an otherwise-externalized library.

### 2f. Jest config options
`jest.config.js` keys (`setupFilesAfterEnv`, `moduleNameMapper`, `testEnvironment`, etc.) move to the
Vitest config: `setupFiles`, `resolve.alias`, `test.environment: 'node'`. `jest.setTimeout(ms)` is a
no-op under the shim (use `test.testTimeout` in config or per-test `{ timeout }`).

---

## 3. Known limits — assertions coupled to Jest's mocks

A minority of tests assert on **Jest's React Native mock internals** rather than rendered behavior.
The native engine runs *real* RN, so these can't be reproduced without re-mocking RN internally
(which defeats the point). Recognize them so you rewrite or skip rather than chase them. In our runs
they clustered in **component libraries** (which test RN internals directly); ordinary app suites hit
few or none.

- **`jest.spyOn(View.prototype, 'measure'/'measureInWindow')`** — Jest mocks `View` as a class with
  prototype methods; real RN's `View` is a `forwardRef` with no such prototype, so the spy target is
  `undefined`. Drive layout via `onLayout`/`fireEvent` instead, or accept as known-incompatible.
- **`jest.mock('react-native/Libraries/…')` of internal submodules** (e.g. `Appearance`,
  `AccessibilityInfo`) then spying them — externalized/resident RN isn't intercepted by a submodule
  mock. Prefer the public API from `react-native`.
- **`image.props.source.uri` / raw `source`-shape assertions** — real RN normalizes `source`, so the
  raw shape differs. Native = real RN = ground truth; assert on behavior instead.
- **`jest.mock('react-native', …)` nested inside `beforeAll`/`describe` callbacks** — Jest doesn't
  hoist those (they're inert); vitest-native applies mocks more consistently, which can expose a mock
  that was silently a no-op. Move it to top level with a valid override, or drop it.

The `jest.requireActual('react-native')` clone-and-override pattern is supported (RN's module is
writable under the compat layer). **Expo caveat:** suites importing **Expo core** pull in Expo's
dev-server/init plumbing (message socket, dev tools) that expects a Metro connection and may not
collect without extra setup; suites using Expo *modules* via the `expo` preset are unaffected.

---

## 4. Suggested migration recipe

1. Add the jest-compat config (section 1). Upgrade RNTL to a supported 12–14 release (2b).
2. Delete manual third-party native-lib mocks and `@react-native/jest-preset` (2c, 2e).
3. Convert any **top-level** `jest.mock(...)` to `vi.mock(...)`; leave runtime `jest.*` as-is (2a).
4. Run `vitest run -u` once to re-record snapshots (2d), then `vitest run` to confirm green.
5. Triage remaining failures — a missing query update, a suite-specific mock, or a known
   Jest-mock-coupled assertion (section 3). For runtime issues (large-suite memory limits,
   error-boundary console noise, overriding a preset's mock), see the
   [Troubleshooting](../README.md#troubleshooting) section.

## 5. What "done" looks like

A migrated suite runs under Vitest with: the jest-compat aliases + setup, RNTL 12–14, no manual
third-party native mocks, top-level mocks converted, and snapshots re-recorded. You get Vitest's
speed/watch/UI while keeping `engine: 'native'` real-RN fidelity (or `engine: 'mock'` for the fast
path). The compat layer is intentionally small — it removes the mechanical Jest coupling so the only
work left is the genuinely suite-specific bits.
