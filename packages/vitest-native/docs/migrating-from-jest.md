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

### 2d. Snapshots: keep Jest's and Vitest's apart, then record Vitest's
Jest's `.snap` files are not something Vitest can check against, for two reasons.

**Keys differ.** Vitest names a snapshot by joining the `describe` and test names with ` > `
(`a > b 1`), Jest with a space (`a b 1`). A hint is `name > hint 1` under Vitest, `name: hint 1`
under Jest. Only a top-level test without a hint has the same key in both. For every other entry
Vitest finds no snapshot and treats it as new:

- Locally, it writes the new entry and the test **passes, whatever it rendered**. It also rewrites
  the file's header to `// Vitest Snapshot v1` and leaves Jest's entries in place as obsolete. A
  plain local `jest` still passes, reports Vitest's entries as obsolete and puts its own header
  back; `jest --ci` refuses the file ("Outdated snapshot: No snapshot header found").
- In CI (`CI` set), it writes no new entries and every such test fails as `mismatched`. It still
  rewrites the file's header, so a `jest --ci` run after it in the same checkout refuses the file
  too.

So a first local run is not a comparison with Jest's snapshots, and `vitest -u` rewrites Jest's
files.

**Trees differ.** Under `engine: 'native'`, real React Native renders **real host component names**
(`RCTText`, `RCTView`, `RCTScrollView`) and the host props it computes, whereas
`@react-native/jest-preset` snapshots show mock names (`Text`, `View`). So even an entry whose key
matches usually differs.

While both runners run, give Vitest its own directory, so that neither rewrites the other's files:

```ts
// vitest.config.mts
import path from "node:path";

export default defineConfig({
  test: {
    // Jest keeps __snapshots__/; Vitest writes __vitest_snapshots__/ beside it.
    resolveSnapshotPath: (testPath, snapExtension) =>
      path.join(
        path.dirname(testPath),
        "__vitest_snapshots__",
        path.basename(testPath) + snapExtension,
      ),
  },
});
```

Run `vitest run` once locally to record them, review the new files as you would any new snapshot,
and commit them. CI then checks against them, and Jest's own runs, `jest -u` included, leave them
alone. Once Jest is gone, either keep the setting and delete `__snapshots__/`, or delete Jest's
files, remove the setting and record again with `vitest run -u`.

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
Vitest config: `setupFiles`, `resolve.alias`, `test.environment: 'node'`. A suite on
`testEnvironment: 'jsdom'` keeps it as `test.environment: 'jsdom'` (`'happy-dom'` works too): React
Native renders there alongside the DOM, with either engine and with or without the hot runtime.
`jest.setTimeout(ms)` sets the timeout for the rest of the file, as in Jest (the shim maps it onto
`vi.setConfig({ testTimeout })`). Jest's `fakeTimers` config is not read. Pass its options to
`jest.useFakeTimers(...)` in the tests, which translates them (`advanceTimers`, `doNotFake`, `now`,
`timerLimit`); a `beforeEach(() => jest.useFakeTimers({ ... }))` in a setup file covers every test.
Or set them in Vitest's names under `test.fakeTimers` (`doNotFake` as `toFake`, `advanceTimers` as
`shouldAdvanceTime` and `advanceTimeDelta`). Don't call `jest.useFakeTimers(options)` at the top
level of a setup file: RNTL switches to real timers and back with
`jest.useFakeTimers({ legacyFakeTimers: false })` when it loads, and that drops the options. Unlike
Jest, `process.nextTick` and `queueMicrotask` stay real.

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
- **Factory-less `jest.mock('react-native/Libraries/…')` of internal submodules** (e.g.
  `Appearance`, `AccessibilityInfo`) then spying them — Vitest builds a factory-less mock for
  imports only, so externalized/resident RN's own require of the submodule isn't intercepted.
  Prefer the public API from `react-native`. A submodule mock **with a factory** does reach React
  Native under jest-compat (see the jest-compat guide's "One module registry per test file").
- **`image.props.source.uri` / raw `source`-shape assertions** — real RN normalizes `source`, so the
  raw shape differs. Native = real RN = ground truth; assert on behavior instead.
- **`jest.mock('react-native', …)` nested inside `beforeAll`/`describe` callbacks** — Jest doesn't
  hoist those (they're inert); vitest-native applies mocks more consistently, which can expose a mock
  that was silently a no-op. Move it to top level with a valid override, or drop it.

The `jest.requireActual('react-native')` clone-and-override pattern is supported (RN's module is
writable under the compat layer). `jest.requireActual` and `jest.requireMock` also apply the
project's `resolve.alias` string entries, so a partial mock of `'@/services/api'` works the way
`babel-plugin-module-resolver` or jest-expo's path mapping made it work under Jest. Configure the
alias with a string `find` (`{ "@": path.resolve(__dirname, "src") }`); regex aliases and custom
resolvers cannot be applied to `requireActual`, and an unresolved specifier says so. **Coming from
jest-expo:** `migrate` translates its presets, and expo-router's own testing library runs as written —
see the [Expo guide](https://danfry1.github.io/vitest-native/guide/expo).

---

## 4. Suggested migration recipe

1. Add the jest-compat config (section 1). Upgrade RNTL to a supported 12–14 release (2b).
2. Delete manual third-party native-lib mocks and `@react-native/jest-preset` (2c, 2e).
3. Convert any **top-level** `jest.mock(...)` to `vi.mock(...)`; leave runtime `jest.*` as-is (2a).
4. Point Vitest's snapshots at their own directory and record them with one local `vitest run`
   (2d), then run `vitest run` again to confirm green.
5. Triage remaining failures — a missing query update, a suite-specific mock, or a known
   Jest-mock-coupled assertion (section 3). For runtime issues (large-suite memory limits,
   error-boundary console noise, overriding a preset's mock), see the
   [Troubleshooting](../README.md#troubleshooting) section.

## 5. What "done" looks like

A migrated suite runs under Vitest with: the jest-compat aliases + setup, RNTL 12–14, no manual
third-party native mocks, top-level mocks converted, and snapshots recorded by Vitest. You get Vitest's
speed/watch/UI while keeping `engine: 'native'` real-RN fidelity (or `engine: 'mock'` for the fast
path). The compat layer is intentionally small — it removes the mechanical Jest coupling so the only
work left is the genuinely suite-specific bits.
