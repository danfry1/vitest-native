# Migrating from Jest

A Jest suite for React Native is coupled to Jest in a few ways:

- the `jest` global and `@jest/globals`;
- top-level `jest.mock`;
- manual mocks of native libraries;
- the Jest config;
- recorded snapshots.

`vitest-native migrate` writes a config that handles most of it, and the [jest-compat layer](/guide/jest-compat) lets test files keep their `jest.*` calls. Most suites still need a short round of fixes on the first run. This page covers that round, and how to run both runners until you remove Jest.

::: tip Adopt incrementally if you prefer
You don't have to move everything at once. Write new tests for Vitest while the existing suite keeps running on Jest, and move older tests as you touch them. [Running Jest and Vitest side by side](#side-by-side) covers both ways.
:::

## The recipe

1. **Install** Vitest, Vite and vitest-native, and upgrade React Native Testing Library to a supported release (see [Requirements](/guide/install)):

   ```bash
   npm install -D vitest vite vitest-native
   ```

2. **Read the migration report.** `migrate` reads your Jest config and prints what it maps, what it drops, which manual mocks the [presets](/guide/presets) replace, and what needs a decision from you. It ends with a suggested config:

   ```bash
   npx vitest-native migrate
   ```

3. **Write the config** with `npx vitest-native migrate --write`. It refuses to overwrite an existing config unless you add `--force`. It never edits test files.
4. **Give Vitest its own snapshot directory** before the first run, so it cannot rewrite Jest's `.snap` files. See [snapshots](#snapshots).
5. **Run it** with `npx vitest run`, and work through the failures with the [first-run checklist](#first-run).
6. **Compare with Jest.** `npx vitest-native compare` runs your Jest and then your Vitest, and lists every test that passes under Jest and not under Vitest. See [side by side](#side-by-side).
7. **Remove Jest** once `compare` finds no differences. See [Removing Jest](#removing-jest).

## What the config contains

`migrate --write` writes a `vitest.config.mts` along these lines, with your setup files, aliases and options added:

```ts
import { defineConfig } from 'vitest/config'
import { reactNative } from 'vitest-native'
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from 'vitest-native/jest-compat'

export default defineConfig({
  plugins: [reactNative(), jestMockTransform()],
  resolve: {
    dedupe: ['react', 'react-test-renderer', 'react-is'],
    alias: { ...jestCompatAliases() },
  },
  test: {
    globals: true,
    environment: 'node',
    clearMocks: false,
    setupFiles: [jestCompatSetup],
  },
})
```

| Piece | What it does |
|---|---|
| `jestCompatSetup` | Installs a `jest` global backed by Vitest's `vi`, with a sync `jest.requireActual` and `jest.requireMock`. |
| `jestMockTransform()` | Hoists top-level `jest.mock(...)` calls, so existing calls apply unchanged. See [top-level jest.mock](#top-level-jest-mock). |
| `jestCompatAliases()` | Points `@jest/globals` at Vitest's globals, and makes `@testing-library/jest-native/extend-expect` a no-op (its matchers are already registered). |
| `clearMocks: false` | Keeps Jest's default. Vitest clears mock calls before every test unless told not to. `migrate` writes your Jest value instead when your config sets one. |

The [jest-compat reference](/guide/jest-compat) covers each piece. `migrate` also carries over:

- `setupFilesAfterEnv` as `setupFiles`;
- `moduleNameMapper` path aliases as `resolve.alias`;
- `testTimeout`;
- the timeouts and worker flags your `test` script passes to Jest.

It also sets `include` to the files Jest runs, so both runners run the same tests.

## What to expect on the first run {#first-run}

Check failures in this order. The first items are config fixes, each of which can clear many tests at once. The later ones are fixes to individual tests.

1. **The migration report's "Needs your attention" items.** Read them before anything else: a regex module mapper, fake-timer config, and keys `migrate` does not know are left for you.
2. **A parse error in a package.** A package that ships untranspiled JSX or Flow and does not declare `react-native` needs a [`transform`](#drop-jest-preset-and-transform-config) entry. The error names the package.
3. **A Babel plugin your tests depended on**, usually a macro plugin. The report lists these; see [Babel plugins](#babel-plugins-your-jest-run-applied).
4. **Snapshots.** Every snapshot test fails or records anew until Vitest has its own snapshots. See [snapshots](#snapshots).
5. **A partial `jest.mock` that Jest never evaluated.** With `babel-preset-expo`'s `lazyImports` (or another lazy-import setting), Jest loads an imported package only when the code first uses it. vitest-native loads every import when the file loads. So a partial mock that was missing a member was harmless under Jest when no test reached it, and now fails. For example, a `jest.mock('expo-modules-core', …)` without `requireOptionalNativeModule` fails as soon as the module that calls it loads. `migrate` names the lazy-import setting when your Babel config has one. Fix the mock: spread `jest.requireActual(...)` into it, or add the missing member.
6. **Mock calls cleared between tests.** A test that asserts on calls made while modules loaded needs `clearMocks: false`, which `migrate` sets. If you wrote the config by hand, add it.
7. **Fake timers.** Jest's `fakeTimers` config is not read. See [fake timers](/guide/jest-compat#fake-timers) for where its options go.
8. **Assertions on Jest's React Native mocks**: host names such as `'View'`, `View.prototype` spies, raw `source` shapes, and `jest.mock` inside `describe`. See [Known limits](#known-limits).

## Running Jest and Vitest side by side {#side-by-side}

Both runners can run in one project until you're ready to drop Jest.

- **Which files.** `migrate` sets `include` to Jest's test files, so Vitest runs the whole suite. To move tests a few at a time instead, give the moved ones a name of their own and set Vitest's `include` to it. Then add a regex for the same name to Jest's `testPathIgnorePatterns`, such as `'\\.vitest\\.test\\.'`:

  ```ts
  test: { include: ['src/**/*.vitest.test.{ts,tsx}'] }
  ```

- **Scripts.** Keep `test` running Jest and add a script for Vitest, for example `"test:vitest": "vitest run"`. Run `vitest` without `run` to get watch mode.
- **Snapshots.** Give each runner its own directory (see [snapshots](#snapshots)). Record Vitest's locally, then commit them.
- **CI.** Run both commands as separate steps. With `CI` set, Vitest records no new snapshots, as with `jest --ci`, so a test with no recorded Vitest snapshot fails there.
- **Differences.** `npx vitest-native compare` runs your own Jest, then your own Vitest, and lists each test that passes under Jest and not under Vitest, grouped by its first error. It writes no snapshots and changes no project files. It exits 0 only when every test that passes under Jest also passes under Vitest, and `vitest run` exits 0. `--json <file>` writes a report to attach to an issue, with stack traces, code frames and absolute paths removed. The [CLI page](/guide/cli#compare) lists its options.

## Removing Jest

When `compare` exits 0 and you no longer want the Jest run:

1. Point the `test` script at `vitest run`, and remove the Jest step from CI.
2. Remove the Jest packages your project lists: `jest`, the Jest preset (`jest-expo` or `@react-native/jest-preset`), `babel-jest`, Jest reporters, and the Jest config (`jest.config.*` or `package.json#jest`).
3. Delete Jest's snapshots, as [snapshots](#snapshots) describes.
4. TypeScript: with `globals: true`, add Vitest's global types to the `tsconfig.json` that covers your tests:

   ```json
   { "compilerOptions": { "types": ["vitest/globals"] } }
   ```

   vitest-native does not declare a type for the `jest` global. Before you remove `@types/jest`, change `jest.*` calls in TypeScript tests to `vi.*`. They keep working at runtime either way.

## Fixes the config does not make

### Top-level jest.mock

Vitest hoists only mock calls made on `vi`. Left alone, a top-level `jest.mock('react-native', factory)` would run after the imports and not apply. `jestMockTransform()` rewrites top-level `jest.mock`, `jest.unmock`, `jest.doMock` and `jest.doUnmock` to the hoisted `vi` form, so you can leave the calls as they are. It also gives each factory's return value Jest's CommonJS meaning, so the two common manual-mock shapes import as they did under Jest:

```ts
jest.mock('./Icon', () => () => null)         // a function: `import Icon from './Icon'` gets it
jest.mock('./api', () => ({ get: vi.fn() }))  // named members only: `import api from './api'` gets the object
```

A factory that already returns an ES module shape (`__esModule`, or an explicit `default`) is left as it is. The transform matches the literal `jest.mock` form, not `jest` assigned to another name.

### Delete third-party native-lib mocks

Most manual mocks of native libraries can go: `jest.mock('react-native-reanimated', …)`, safe-area's `jest/mock`, gesture-handler's `jestSetup` and similar. vitest-native detects installed libraries and replaces their native side with a [preset](/guide/presets), under both engines; the [full list](/guide/presets#available-presets) names every package. `migrate` lists the mocks and setup lines the presets cover.

Some libraries keep running as themselves:

- **Expo modules**, under the native engine, run their own JavaScript, as under jest-expo. The `expo` preset applies only under the mock engine, or when you turn it on with `presets: { expo: true }`.
- **Libraries that support Jest themselves**, such as react-native-mmkv 3 and later and react-native-worklets 0.9 and later, run as themselves. Their preset steps aside.

A mock you wrote for your own app's modules stays.

### Keep Jest's and Vitest's snapshots apart {#snapshots}

Jest's `.snap` files are not something Vitest can check against, for two reasons.

**Keys differ.** Vitest names a snapshot by joining the `describe` and test names with ` > ` (`a > b 1`), Jest with a space (`a b 1`). A hint is `name > hint 1` under Vitest, `name: hint 1` under Jest. Only a top-level test without a hint has the same key in both. For every other entry Vitest finds no snapshot and treats it as new:

- Locally, it writes the new entry and the test **passes, whatever it rendered**. It also rewrites the file's header to `// Vitest Snapshot v1` and leaves Jest's entries in place as obsolete. A plain local `jest` still passes, reports Vitest's entries as obsolete and puts its own header back; `jest --ci` refuses the file ("Outdated snapshot: No snapshot header found").
- In CI (`CI` set), it writes no new entries and every such test fails as `mismatched`. It still rewrites the file's header, so a `jest --ci` run after it in the same checkout refuses the file too.

So a first local run is not a comparison with Jest's snapshots, and `vitest -u` rewrites Jest's files.

**Trees differ.** Under `engine: 'native'`, real React Native renders **real host component names** (`RCTText`, `RCTView`, `RCTScrollView`) and the host props it computes, whereas `@react-native/jest-preset` snapshots show mock names (`Text`, `View`). So even an entry whose key matches usually differs.

While both runners run, give Vitest its own directory, so that neither rewrites the other's files:

```ts
// vitest.config.mts
import path from 'node:path'

export default defineConfig({
  test: {
    // Jest keeps __snapshots__/; Vitest writes __vitest_snapshots__/ beside it.
    resolveSnapshotPath: (testPath, snapExtension) =>
      path.join(path.dirname(testPath), '__vitest_snapshots__', path.basename(testPath) + snapExtension),
  },
})
```

Run `vitest run` once locally to record them, review the new files as you would any new snapshot, and commit them. CI then checks against them, and Jest's own runs, `jest -u` included, leave them alone. Once Jest is gone, either keep the setting and delete `__snapshots__/`, or delete Jest's files, remove the setting and record again:

```bash
vitest run -u
```

::: tip
Prefer explicit queries (`getByText`, `getByTestId`, `getByRole`) over large snapshots — they're robust across the engine's real host names and far easier to review.
:::

### Drop jest-preset and transform config

`@react-native/jest-preset`, `transform` and `transformIgnorePatterns` are Jest config, and `migrate` drops them. vitest-native compiles React Native itself. It also compiles packages that declare `react-native` as a dependency or peer dependency, and the packages they use.

A package that ships untranspiled JSX or Flow in `.js` files, and does not declare `react-native`, needs an entry in the plugin's [`transform`](/guide/plugin-options#transform) option. This replaces listing it in `transformIgnorePatterns`. `migrate` adds one for each package your allowlist names that Node cannot parse. Otherwise the run fails with a parse error that names the file:

```ts
reactNative({ transform: ['<package>'] })
```

See [untranspiled packages](/guide/mocking#packages-that-ship-untranspiled-source), and [what `vi.mock` reaches](/guide/mocking#what-vi-mock-reaches) for mocking a library.

### Babel plugins your Jest run applied

Under Jest, babel-jest ran your `babel.config.js` on every file. Under the native engine, vitest-native applies it only to project TypeScript files Node loads (through `require()` or `jest.requireActual`): the files your tests `import` go through Vite's transform, and React Native's own code through RN's Babel preset. Most plugins in a React Native Babel config exist for Metro and are not missed, but a few change what the code means. `vitest-native migrate` and `doctor` read the config and sort its plugins:

| Plugin | Under vitest-native |
|---|---|
| `babel-plugin-macros` (`'macros'`), `@lingui/babel-plugin-lingui-macro`, other macro plugins | **Required.** A macro is compiled away at build time; without the plugin the macro module is imported for real and fails, typically with `Cannot find module 'babel-plugin-macros'`. |
| `babel-plugin-module-resolver` (`'module-resolver'`) | Its `alias` entries become `resolve.alias` (same exact-or-`key/` prefix rule). `migrate` writes them. |
| `react-native-worklets/plugin`, `react-native-reanimated/plugin` | Not needed when the worklets/reanimated preset is active (it replaces the library, so no worklet runs) or the library is not installed; otherwise listed for you to judge. |
| `babel-plugin-react-compiler` | Not needed: it only adds memoization, and components render the same without it. |
| anything else | Listed for you to judge — check whether a test depends on what it does. |

Required plugins run through a Vite plugin that calls Babel:

```ts
// npm i -D @rolldown/plugin-babel @babel/core
import babel from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    reactNative(),
    babel({ plugins: ['@lingui/babel-plugin-lingui-macro'] }),
    jestMockTransform(),
  ],
})
```

Vite 8's `@vitejs/plugin-react` (v6) no longer runs Babel and points to [`@rolldown/plugin-babel`](https://www.npmjs.com/package/@rolldown/plugin-babel) for it. List only the plugins your tests need. It does not load `babel.config.js`, so the full Metro preset is not applied twice. When `@rolldown/plugin-babel` and `@babel/core` are installed, `migrate --write` adds the `babel()` entry itself.

### Other Jest config options

- **Test environment.** A suite on `jsdom` keeps it as `test.environment: 'jsdom'` (`'happy-dom'` works too). React Native renders there alongside the DOM, with either engine.
- **Timeouts.** `jest.setTimeout(ms)` sets the timeout for the rest of the file, as in Jest.
- **Fake timers.** Jest's `fakeTimers` config is not read. Pass its options to `jest.useFakeTimers(...)` in a `beforeEach`, or set them in Vitest's names under `test.fakeTimers`. A `jest.useFakeTimers(options)` at the top level of a setup file loses its options once RNTL loads. See [fake timers](/guide/jest-compat#fake-timers).
- **Resetting mocks.** Jest's `resetMocks` is `test.mockReset` in Vitest. A `resetMocks` key in a Vitest config is ignored.
- **Config types.** `vitest/config` does not export `UserConfig`. A config or shared helper that imports it fails to typecheck; import `ViteUserConfig` instead.

## Known limits: assertions on Jest's mocks {#known-limits}

A minority of tests assert on **Jest's React Native mock internals** rather than on rendered behavior. The native engine runs *real* React Native, so these can't be reproduced without re-mocking RN internally (which would defeat the point). They're worth recognizing up front so you can rewrite or skip them rather than chase them. In our own runs these were concentrated in **component libraries** (which test RN internals directly); ordinary app suites hit few or none.

| Jest-coupled pattern | Why it doesn't port | What to do |
|---|---|---|
| `jest.spyOn(View.prototype, 'measure')` / `'measureInWindow'` | Jest mocks `View` as a class with methods on its prototype; real RN's `View` is a `forwardRef` with no such prototype, so the spy target is `undefined`. | Rewrite to drive layout via `onLayout` / `fireEvent`, or accept as a known-incompatible assertion. |
| `jest.mock('react-native/Libraries/Utilities/Appearance')` (and other deep RN-internal submodules) **without a factory**, then `jest.spyOn` them | Under the native engine RN is externalized/resident, and Vitest builds a factory-less mock for imports only, so it never intercepts React Native's own require of the submodule. | Prefer the public API (e.g. `Appearance` from `react-native`); vitest-native provides controllable boundaries for common ones. A `jest.mock` of the submodule **with a factory** does reach React Native under the [jest-compat layer](/guide/jest-compat#one-module-registry-per-test-file). |
| Finding nodes by host type name: `node.type === 'View'`, `findAllByType('Text')` | Jest's preset mocks `View` and `Text` as host elements named `'View'` and `'Text'`. Real RN renders its native host components: `RCTView` for `View`, `RCTText` for `Text` (`RCTVirtualText` when nested in another `Text`). A lookup by the mock's name finds nothing. The mock engine keeps the `'View'`/`'Text'` names. | Query by what the user sees: RNTL's `getByText`, `getByRole` or `getByTestId` don't depend on host names. If a test must walk the tree, match the real host names (`node.type === 'RCTView'`). |
| `image.props.source.uri` / raw `source`-shape assertions | Real RN normalizes the `source` prop (an object like `{ uri }`), so tests reading the raw mock shape see a different value. Native = real RN = ground truth. | Assert on behavior (what renders) rather than the internal prop shape. |
| `jest.mock('react-native', …)` **nested inside** `beforeAll`/`describe` callbacks | Jest does **not** hoist a `jest.mock` inside a callback, so under Jest it's effectively inert; vitest-native applies mocks more consistently, which can expose a mock that was silently doing nothing. | Move the mock to top level and make its override valid, or drop it if it was a no-op. |

The `jest.requireActual('react-native')` clone-and-override pattern (`const RN = jest.requireActual('react-native'); RN.Platform = {…}; return RN`) **is** supported — RN's module is writable under the compat layer.

::: tip Coming from jest-expo
`migrate` translates the jest-expo presets, and expo-router's own testing library runs as written. See [Expo](/guide/expo).
:::
