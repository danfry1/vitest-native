# jest-compat Layer

`vitest-native/jest-compat` lets an existing Jest suite run under Vitest **without rewriting `jest.*` to `vi.*`**. Your test files keep their `jest` calls and just work — it's an opt-in layer that clears the mechanical Jest-API coupling (not a full auto-migration).

## Setup

```ts
// vitest.config.ts
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

## The three pieces

| Piece | What it does |
|---|---|
| `jestCompatSetup` | Installs a `jest` global backed by Vitest's `vi`, so `jest.fn` / `jest.spyOn` / `jest.useFakeTimers` work unchanged. Adds the sync `jest.requireActual` / `requireMock` that Vitest only ships as async, a global `require`, maps `jest.setTimeout` onto the file's test timeout, and sets `process.env.JEST_WORKER_ID` (from Vitest's 1-based `VITEST_POOL_ID`, unless already set) so code that detects a Jest run takes its test branch. |
| `jestMockTransform()` | A Vite plugin that makes top-level `jest.mock(...)` actually apply. Vitest only hoists `vi.mock`, so it rewrites `jest.mock` / `unmock` / `doMock` / `doUnmock` to the hoisted `vi.*` form, and runs each factory's return through Jest's CommonJS interop (so `() => Component` and named-only factories resolve the way Jest resolves them, getters in the returned object are read only when the app reads them, and an export the factory leaves out is `undefined` rather than a `No "x" export is defined` error). A plain `vi.mock` factory keeps Vitest's strict behaviour. |
| `jestCompatAliases()` | `resolve.alias` entries: `@jest/globals` → a Vitest-globals shim (unblocks `@testing-library/react-native` < 12), and `@testing-library/jest-native/extend-expect` → a no-op (those matchers are already registered). |

## You don't swap the test API

| In your Jest test | Under jest-compat |
|---|---|
| `jest.fn()`, `jest.spyOn()`, `jest.useFakeTimers()` | work as-is (the global `jest` is `vi`, and its mocks are `vi` mocks) |
| `new` on a `jest.fn(() => ({ ... }))` | returns the implementation's object, as in Jest — Vitest's own `vi.fn` requires a `function` or `class` implementation for `new`, and `jest.fn` does not |
| `import { jest } from '@jest/globals'` | resolves to the `vi`-backed `jest` (aliased) |
| top-level `jest.mock('m', factory)` | hoisted + applied, with Jest's factory interop |
| `describe` / `it` / `expect` / `beforeEach` | same names, available as globals |

## One module registry per test file

Jest keeps one module registry per test file, so a `jest.mock(spec, factory)` applies to every way the file loads that module. Under Vitest, imports go through Vite, while `require()`, `jest.requireActual` and whatever those load go through Node. With `jestMockTransform()` and `jestCompatSetup`, both loaders share one per-file registry of `jest.mock` factories, keyed by the resolved file (aliases, tsconfig `paths` and platform extensions included):

| In your Jest test | Under jest-compat |
|---|---|
| `require('#/x')` in a test, with `jest.mock('#/x', factory)` | returns the mock — the same object `jest.requireMock('#/x')` returns |
| `jest.mock('a', () => jest.requireActual('a/index.web'))` while `jest.mock('#/storage', …)` | the module `requireActual` loads gets the mocked `#/storage`: only the requested module is unmocked, as in Jest |
| `jest.requireActual('#/x')` of a mocked module | the real module; everything else still gets the mock |
| `const { Sentry } = jest.requireMock('#/sentry')` | the registered mock, the same objects the file's imports see |
| `jest.mock('react-native/Libraries/AppState/AppState', factory)` | applies to React Native's own `require` of that module, so `import { AppState } from 'react-native'` and `require('react-native').AppState` see the mock |
| `jest.mock('virtual', factory, { virtual: true })` | `require('virtual')` returns the mock |
| `jest.doMock` / `jest.setMock` / `jest.unmock` / `jest.dontMock` | register and unregister for `require()` too |
| `jest.resetModules()` then `require(…)` | a fresh copy of each project module, which still sees the mocks; factories run again on the next load. React Native and other `node_modules` packages stay loaded |
| `jest.isolateModules(fn)` | modules `require`d inside `fn` are fresh, and so are mock instances; afterwards the earlier ones are back. Nesting throws Jest's error |
| `await jest.isolateModulesAsync(fn)` | the same across `await`s, for `require()` and for `import()` |
| `require('./x')` after the test imported `./x` | the instance the import got, not a second copy |

Remaining differences:

- A factory-less `jest.mock('x')` (automock or `__mocks__`) is built by Vitest for imports only: `require('x')` and `jest.requireMock('x')` return the real module.
- `jest.resetModules()` and `isolateModules` renew project modules only; Jest renews `node_modules` packages too.
- After `jest.resetModules()`, a module that is both imported and `require`d is loaded once by each loader, so the two are separate copies.
- A `jest.mock` / `jest.doMock` whose specifier is computed (anything but a string or a variable, such as `jest.mock(path.join(…))`) applies to imports only.

## What it does *not* do

It clears the API coupling, not the suite-specific work — you still:

- write mocks for native libraries with no [preset](/guide/presets),
- re-record snapshots (`vitest -u`),
- and fix the occasional factory that references an out-of-scope `mock`-prefixed variable (Jest's Babel plugin allows that; Vitest doesn't).

For the full migration walkthrough — including which manual mocks you can delete and how snapshots change — see [Migrating from Jest](/migration/from-jest).
