# Upgrading to 0.15

0.15 raises the supported versions and changes four things a suite can notice. Start with
`doctor`, which checks your versions and your config:

```bash
npx vitest-native doctor
```

## Supported versions

| | 0.15 needs | An older one |
|---|---|---|
| Node | 22.22.3+ on Node 22, 24.12+ on Node 24, or 26+ | stops at startup with [`UNSUPPORTED_NODE`](/guide/errors#UNSUPPORTED_NODE) |
| Vitest | 5 | stops with [`UNSUPPORTED_PEER`](/guide/errors#UNSUPPORTED_PEER) |
| Vite | ^8.0.5 | stops with `UNSUPPORTED_PEER` |
| React | 19 | stops with `UNSUPPORTED_PEER` |
| React Native (native engine) | 0.86–0.88 | below 0.86 stops with `UNSUPPORTED_PEER`; above 0.88 warns |
| Expo SDK | 57 and 58 | warns |
| React Native Testing Library | 13 or 14 | warns |

1. Update Node in your machine, CI images and `.nvmrc` or `engines`.
2. Install `vitest@^5` with matching `@vitest/*` packages, and `vite@^8.0.5`.
3. Upgrade React Native to 0.86 or later (Expo SDK 57 or later) and React to 19, and move from
   React Native Testing Library 12 to 13 or 14. Testing Library 14 makes `render`, `fireEvent`
   and `act` async: `await render(<App />)`.
4. Vitest 5 clears mock calls before every test. A suite that asserts on calls made before the
   test started sets `test.clearMocks: false`.

## Re-record snapshots once

Snapshots of React Native trees now print in Jest's format, as Vitest prints any React tree, and
no host prints a `ref`. Snapshots recorded by an earlier vitest-native fail once:

```bash
npx vitest run -u
```

Review the diff before committing it. For one release, the old format is still available, and
deprecated: `expect.addSnapshotSerializer(serializer)` with `serializer` from
`vitest-native/serializer`, in a setup file. [Snapshots](/guide/matchers#snapshots) has the
details, including which Jest-written snapshots need a re-record.

## Manual mocks of `node_modules` packages apply

With `jestMockTransform()`, a file such as `__mocks__/moti.ts` in a `__mocks__` folder under Jest's
`roots` now replaces that package with no `jest.mock()` call, as it does under Jest. Before, the
real package ran.

If a test relied on the real package, delete or rename that mock, or keep the previous
behaviour with `jestMockTransform({ rootMocks: false })`. A package a preset covers keeps its
preset, and the run says the manual mock is not applied.
[Manual mocks of `node_modules` packages](/guide/jest-compat#manual-mocks-of-node-modules-packages)
has the details.

## Your Babel config applies where it is needed

A file that needs a plugin from your project's Babel config (legacy decorators, macros,
`react-native-dotenv`, the worklets plugin, custom plugins, Flow) now compiles with that config,
as under Metro and babel-jest. Every other file keeps Vite's own compiler.

- Remove any `babel()` entry you added only to run those plugins. `doctor` names the ones that
  are now redundant.
- `@babel/core` must be installed in the project. `migrate`, `doctor` and the mock engine's
  startup say when it is not.
- To keep the previous behaviour, set [`projectBabel: 'never'`](/guide/plugin-options#projectbabel).

## Also new

- **The hot runtime fails a stuck run instead of waiting forever,** naming the file and test.
  Set [`hangTimeout`](/guide/plugin-options#hangtimeout) to change or turn this off.
- **Several presets are now each library's own Jest mock** under the native engine
  (worklets, safe-area-context, keyboard-controller, bottom-sheet, netinfo), and Reanimated 4.7+
  is its own mock. Snapshots of the presets' own output may change.

The full list of changes is in the
[changelog](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/CHANGELOG.md).
