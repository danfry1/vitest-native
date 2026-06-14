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
| `jestCompatSetup` | Installs a `jest` global backed by Vitest's `vi`, so `jest.fn` / `jest.spyOn` / `jest.useFakeTimers` work unchanged. Adds the sync `jest.requireActual` / `requireMock` that Vitest only ships as async, a global `require`, and no-ops `jest.setTimeout`. |
| `jestMockTransform()` | A Vite plugin that makes top-level `jest.mock(...)` actually apply. Vitest only hoists `vi.mock`, so it rewrites `jest.mock` / `unmock` / `doMock` / `doUnmock` to the hoisted `vi.*` form, and runs each factory's return through Jest's CommonJS interop (so `() => Component` and named-only factories resolve the way Jest resolves them). |
| `jestCompatAliases()` | `resolve.alias` entries: `@jest/globals` → a Vitest-globals shim (unblocks `@testing-library/react-native` < 12), and `@testing-library/jest-native/extend-expect` → a no-op (those matchers are already registered). |

## You don't swap the test API

| In your Jest test | Under jest-compat |
|---|---|
| `jest.fn()`, `jest.spyOn()`, `jest.useFakeTimers()` | work as-is (the global `jest` **is** `vi`) |
| `import { jest } from '@jest/globals'` | resolves to the `vi`-backed `jest` (aliased) |
| top-level `jest.mock('m', factory)` | hoisted + applied, with Jest's factory interop |
| `describe` / `it` / `expect` / `beforeEach` | same names, available as globals |

## What it does *not* do

It clears the API coupling, not the suite-specific work — you still:

- write mocks for native libraries with no [preset](/guide/presets),
- re-record snapshots (`vitest -u`),
- and fix the occasional factory that references an out-of-scope `mock`-prefixed variable (Jest's Babel plugin allows that; Vitest doesn't).

For the full migration walkthrough — including which manual mocks you can delete and how snapshots change — see [Migrating from Jest](/migration/from-jest).
