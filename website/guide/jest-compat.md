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
| `jest.fn()`, `jest.spyOn()`, `jest.useFakeTimers()` | work as-is (the global `jest` is `vi`, and its mocks are `vi` mocks); `jest.useFakeTimers(options)` takes Jest's options — see [Fake timers](#fake-timers) |
| `new` on a `jest.fn(() => ({ ... }))` | returns the implementation's object, as in Jest — Vitest's own `vi.fn` requires a `function` or `class` implementation for `new`, and `jest.fn` does not |
| `import { jest } from '@jest/globals'` | resolves to the `vi`-backed `jest` (aliased) |
| top-level `jest.mock('m', factory)` | hoisted + applied, with Jest's factory interop |
| `describe` / `it` / `expect` / `beforeEach` | same names, available as globals |

## Fake timers

`jest.useFakeTimers(options)` translates Jest's options into Vitest's the way Jest translates them for `@sinonjs/fake-timers`, which both runners use: `advanceTimers` (`true` or a step in ms), `doNotFake`, `now` and `timerLimit` (default 100,000 as in Jest, where Vitest's is 10,000). It returns the `jest` object, as Jest does, so `jest.useFakeTimers().setSystemTime(date)` chains. Calling `vi.useFakeTimers` directly still takes Vitest's options.

Two differences remain:

- `process.nextTick` and `queueMicrotask` stay real. Jest fakes them by default; Vitest does not, because Node and Vitest's runner depend on them. Name them in Vitest's `toFake` if a test needs them faked.
- `legacyFakeTimers: true` runs modern fake timers over the timer functions and leaves `Date` real, as legacy timers do. The timer functions are not mock functions, so assertions such as `expect(setTimeout).toHaveBeenCalled()` do not work; the first such call logs a warning.

Options set in Jest's `fakeTimers` config are not read. Pass them to `jest.useFakeTimers(...)` in the tests, where a `beforeEach(() => jest.useFakeTimers({ ... }))` in a setup file covers every test. Or set them in Vitest's names under `test.fakeTimers` (`doNotFake` as `toFake`, `advanceTimers` as `shouldAdvanceTime` and `advanceTimeDelta`), which applies to every call except for `loopLimit` and `now`: `jest.useFakeTimers` always passes Jest's `timerLimit`, and starts the clock at the real time unless given `now`.

::: warning Known limitation: options in a setup file's top level
A `jest.useFakeTimers(options)` at the top level of a setup file loses its options once React Native Testing Library loads. RNTL switches to real timers and back with `jest.useFakeTimers({ legacyFakeTimers: false })` at import, and that call does not carry the earlier options. A bare `jest.useFakeTimers()` there still fakes timers for the file, as Jest's `enableGlobally` does. With options, use a `beforeEach` or `test.fakeTimers` as above.
:::

## One module registry per test file

Jest keeps one module registry per test file, so a `jest.mock(spec, factory)` applies to every way the file loads that module. Under Vitest, imports go through Vite, while `require()`, `jest.requireActual` and whatever those load go through Node. With `jestMockTransform()` and `jestCompatSetup`, both loaders share one per-file registry of `jest.mock` factories, keyed by the resolved file (string `resolve.alias` entries and platform extensions included). Registrations last for the test file, also when Vitest reuses a worker (`isolate: false`, a watch rerun, or the hot runtime):

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
| `jest.isolateModules(fn)` | modules `require`d inside `fn` are fresh; a mock already created before the block is reused, and one first created inside is fresh and discarded afterwards, as in Jest. Afterwards the earlier modules are back. `jest.resetModules()` inside ends the block, and nesting throws Jest's error |
| `await jest.isolateModulesAsync(fn)` | the same across `await`s, for `require()` and for `import()` |
| `require('./x')` after the test imported `./x` | the instance the import got, not a second copy, and assigning to it (`require('./x').FLAG = true`) is seen by the file's imports. A CommonJS file is required as what it set `module.exports` to |
| a TypeScript project file Node loads (`require`, `requireActual` and what those load) | compiled with the options `@babel/core` loads for it, as babel-jest compiles it, so its macros and plugins apply. Any config Babel reads counts (`babel.config.*`, `.babelrc*`, `package.json#babel`), with its `overrides` and env- or caller-dependent settings. In a project with Expo the caller is jest-expo's Metro caller for the configured platform, so `babel-preset-expo` inlines `Platform.OS`. A file the config `ignore`s, or leaves out of `only`, fails with "Babel ignores …", as under babel-jest |
| a relative `require` from a file Node loads | resolved as Metro resolves it: platform extensions first (`./x` → `x.native.ts` before `x.ts`), a trailing `/` names the directory (`./lib/` → `lib/index.ts`, never `lib.ts`), and a directory's `package.json` entry (`react-native`, then `browser`, then `main`) before its index |

Remaining differences:

- A factory-less `jest.mock('x')` (automock or `__mocks__`) is built by Vitest for imports only: `require('x')` and `jest.requireMock('x')` return the real module.
- `jest.resetModules()` and `isolateModules` renew project modules only; Jest renews `node_modules` packages too.
- After `jest.resetModules()`, a module that is both imported and `require`d is loaded once by each loader, so the two are separate copies.
- Inside `jest.isolateModules` and `jest.isolateModulesAsync`, a project module the block loads with `import()` and also `require`s is two copies; Jest's isolated registry gives one.
- A `jest.mock` / `jest.doMock` whose specifier is computed (anything but a string or a variable, such as `jest.mock(path.join(…))`) applies to imports only.
- `jest.mock` must be at the top level of the file. Inside a `describe` it becomes a nested `vi.mock`, which Vitest rejects ("defined outside of the module's top level scope"); Jest hoists it from there.
- A `jest.mock` in a helper file that Node loads (one a test `require`s) is not hoisted, and does not register for `require()`. babel-jest hoists it there, because it adds `babel-preset-jest` to every file it compiles. Put the call in the test file or in a setup file.
- Finding which Babel options apply means loading the project's config and its plugins. That costs each worker about 0.25 s on a large Expo config, even when the transform cache is warm, the first time it loads a project TypeScript file through Node.
- Without `jestCompatSetup` in `test.setupFiles`, a `jest.mock` factory fails with an error naming it (`JEST_COMPAT_SETUP_MISSING`). It must come before any setup file that calls `jest.mock`.

## What it does *not* do

It clears the API coupling, not the suite-specific work — you still:

- write mocks for native libraries with no [preset](/guide/presets),
- record snapshots for Vitest, which keys them differently from Jest (see [snapshots](/migration/from-jest#snapshots)),
- and fix the occasional factory that references an out-of-scope `mock`-prefixed variable (Jest's Babel plugin allows that; Vitest doesn't).

For the full migration walkthrough — including which manual mocks you can delete and how snapshots change — see [Migrating from Jest](/migration/from-jest).
