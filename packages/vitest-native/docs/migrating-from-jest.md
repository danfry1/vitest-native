# Migrating an existing Jest suite to vitest-native

**Honest expectation first:** this is **not a turnkey drop-in.** Real React Native Jest suites
couple to Jest at several levels (the `jest` global, `@jest/globals`, `jest.mock('react-native')`,
`@react-native/jest-preset`, jest-native matchers, recorded snapshots). The `vitest-native/jest-compat`
layer clears the *API coupling* mechanically; the rest is a small, well-defined per-suite cleanup.

This guide is grounded in real migration runs against production apps — **react-native-paper**
(fresh component tests), the **obytes template**, and **Rocket.Chat** (existing Jest suites).

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

### 2b. Upgrade RNTL to ≥ 12 (recommended)
The `@jest/globals` alias unblocks RNTL < 12, but **upgrading to `@testing-library/react-native@^12`
is the cleaner fix** (12 dropped the `@jest/globals` dependency). vitest-native targets RNTL ≥ 12.

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

### 2f. Jest config options
`jest.config.js` keys (`setupFilesAfterEnv`, `moduleNameMapper`, `testEnvironment`, etc.) move to the
Vitest config: `setupFiles`, `resolve.alias`, `test.environment: 'node'`. `jest.setTimeout(ms)` is a
no-op under the shim (use `test.testTimeout` in config or per-test `{ timeout }`).

---

## 3. Suggested migration recipe

1. Add the jest-compat config (section 1). Upgrade RNTL to ≥ 12 (2b).
2. Delete manual third-party native-lib mocks and `@react-native/jest-preset` (2c, 2e).
3. Convert any **top-level** `jest.mock(...)` to `vi.mock(...)`; leave runtime `jest.*` as-is (2a).
4. Run `vitest run -u` once to re-record snapshots (2d), then `vitest run` to confirm green.
5. Triage remaining failures — usually a missing query update or a suite-specific mock.

## 4. What "done" looks like

A migrated suite runs under Vitest with: the jest-compat aliases + setup, RNTL ≥ 12, no manual
third-party native mocks, top-level mocks converted, and snapshots re-recorded. You get Vitest's
speed/watch/UI while keeping `engine: 'native'` real-RN fidelity (or `engine: 'mock'` for the fast
path). The compat layer is intentionally small — it removes the mechanical Jest coupling so the only
work left is the genuinely suite-specific bits.
