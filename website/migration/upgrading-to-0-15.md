# Upgrading to 0.15

0.15 raises the supported versions and changes what some suites see. Start with `doctor`,
which checks your versions and your config:

```bash
npx vitest-native doctor
```

Coming from 0.9 or older? Start with [Upgrading from 0.9 or older](#upgrading-from-0-9-or-older).

## Supported versions

|                              | 0.15 needs                                     | An older one                                                               |
| ---------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| Node                         | 22.22.3+ on Node 22, 24.12+ on Node 24, or 26+ | stops at startup with [`UNSUPPORTED_NODE`](/guide/errors#UNSUPPORTED_NODE) |
| Vitest                       | 5                                              | stops with [`UNSUPPORTED_PEER`](/guide/errors#UNSUPPORTED_PEER)            |
| Vite                         | ^8.0.5                                         | stops with `UNSUPPORTED_PEER`                                              |
| React                        | 19+                                            | stops with `UNSUPPORTED_PEER`                                              |
| React Native (native engine) | 0.86–0.88                                      | below 0.86 stops with `UNSUPPORTED_PEER`; above 0.88 warns                 |
| Expo SDK                     | 57 and 58                                      | warns                                                                      |
| React Native Testing Library | 13–14                                          | warns                                                                      |

1. Update Node in your machine, CI images and `.nvmrc` or `engines`. Avoid Node 24.13.0, which can
   crash a run at startup (`doctor` warns); use another supported Node 24, such as 24.14 or later. The native engine needs Node: Bun
   stops with `UNSUPPORTED_NODE`.
2. Install `vitest@^5.1.0` with matching `@vitest/*` packages, and `vite@^8.0.5`. Vitest 5.0.x runs, with a
   startup warning: 5.1.0 or later is recommended.
3. Upgrade React Native to 0.86 or later (Expo SDK 57 or later) and React to 19, and move from
   React Native Testing Library 12 to 13 or 14. Testing Library 14 makes `render`, `fireEvent`
   and `act` async: `await render(<App />)`.
4. Vitest 5 clears mock calls before every test. A suite that asserts on calls made before the
   test started sets `test.clearMocks: false`. The plugin also turns on Vitest 5's
   `fsModuleCache`; set `test.fsModuleCache: false` to keep it off.
5. Babel plugins your tests need go through `babel()` from `@rolldown/plugin-babel`:
   `@vitejs/plugin-react` 6 removed its `babel` option.
6. Remove `VITEST_NATIVE_LOADER_THREAD` from scripts and CI. It no longer has an effect.

## Re-record snapshots once

Snapshots of React Native trees now print in Jest's format, as Vitest prints any React tree, and
no host prints a `ref`. Snapshots recorded by an earlier vitest-native fail once:

```bash
npx vitest run -u
```

Review the diff before committing it. A host ref, such as a `Text` ref under the native engine
or any host ref under the mock engine, is now an instance with `measure`, `focus` and the other
native methods, where it used to be the test renderer's node or `null`; update assertions on
`ref.current`.

For one release, the old format is still available, and deprecated: `expect.addSnapshotSerializer(serializer)` with `serializer` from
`vitest-native/serializer`, in a setup file. [Snapshots](/guide/matchers#snapshots) has the
details, including which Jest-written snapshots need a re-record.

## Manual mocks of `node_modules` packages apply

With `jestMockTransform()`, a file such as `__mocks__/moti.ts` in a `__mocks__` folder under Jest's
`roots` (by default the Vite root) now replaces that package with no `jest.mock()` call, as it does under Jest. Before, the
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

## Gesture Handler and FlashList run as themselves

Under the native engine, `react-native-gesture-handler` and `@shopify/flash-list` now run as
their installed packages, with the Jest setup each ships, as a Jest suite runs them.

- `react-native-gesture-handler/Swipeable` and the other modules Gesture Handler 3 does not ship
  no longer resolve.
- A `FlashList` renders a window of rows, as under Jest, where it used to render every row.
- To keep a preset, set `presets: { gestureHandler: true }` or `presets: { flashList: true }`.
- A `presets: { gestureHandler: false }` carried over from older mocks can go: it no longer turns
  off Gesture Handler's own Jest setup, and `flashList: false` likewise.

## Other libraries' own mocks

Under the native engine, the worklets, safe-area-context, keyboard-controller, bottom-sheet and
netinfo presets are now each library's own Jest mock, and Reanimated 4.7+ is its own mock.
Snapshots of their output may change; review the diff and re-record with `vitest -u`.

- Safe-area insets are zero unless `<SafeAreaProvider initialMetrics>` sets them. A test that
  expects other insets passes `initialMetrics`, or calls `setInsets()`, which holds until
  `resetAllMocks()`.
- Worklets' `runOnJS` and `scheduleOnRN` run a tick later, as under Jest: wait for their effect
  (`await waitFor(...)`), or advance fake timers.
- Implementations a library sets up in its own mocks survive `vi.resetAllMocks()` and
  `mockReset: true`. Update a test that expected them to be blank after a reset.
- Reanimated's `interpolate`, `interpolateColor` and `clamp` return real values, so snapshots of
  interpolated styles may change.

## Workarounds you can delete

- `vi.stubEnv('RNTL_SKIP_AUTO_CLEANUP', 'true')` added for the hot runtime:
  `@testing-library/react-native/dont-cleanup-after-each` now works in every file.
- A mock of a `react-native/Libraries/...` file's `.ios.js` copy: a `jest.mock` of the plain path
  now reaches the platform file.
- Renames to `.jsx`, or `oxc.include` overrides, added so your own `.js` files with JSX compile:
  they now compile as under Metro and babel-jest.

## Also new

- **The hot runtime fails a stuck run instead of waiting forever,** naming the file and test.
  Set [`hangTimeout`](/guide/plugin-options#hangtimeout) to change or turn this off.
- **A factory-less `jest.mock('pkg')` automocks `pkg` for `require()` too,** as under Jest, for an
  installed package with no manual mock. A test that relied on `require` getting the real package
  gives `jest.mock` a factory.
- **`SOURCE_EVALUATED_TWICE`** is a new warning under the native engine, naming a file Vite and
  Node both load; its message gives the fix. Set `reactNative({ ownership: 'error' })` to fail on
  it.
- **`init`, `doctor` and `migrate` exit 1 on a flag they do not take,** instead of ignoring it.
  Check scripts that pass extra flags to them.

## Upgrading from 0.9 or older

Go straight to 0.15; there is no need to stop at each release in between. The config keeps its
shape: `reactNative()` from `vitest-native` and the helpers in `vitest-native/helpers` have the
same names.

1. Raise the versions in [Supported versions](#supported-versions). 0.9 accepted Node 20,
   Vitest 4, Vite 6, React 18, React Native 0.81 and React Native Testing Library 12, none of
   which 0.15 runs on. Check every row.
2. Install `vitest-native@^0.15` and run `npx vitest-native doctor`.
3. Run the suite, then re-record snapshots once with `npx vitest run -u` and review the diff.
4. Work through the failures with the sections above and the list below: the changes since 0.9
   that most often need an edit.

Under the native engine:

- **Native modules answer as on a device.** `NativeModules[name]` is `undefined` and
  `TurboModuleRegistry.get(name)` is `null` for a module no app registers, and a React Native
  module's stub has only the methods its codegen spec declares. Register what a test needs with
  [`mockNativeModule(name, impl)`](/guide/helpers#mocknativemodule-name-impl), or set
  [`nativeModules: 'permissive'`](/guide/plugin-options#nativemodules) while you add them.
- **Expo modules run as their installed packages,** with jest-expo's values: `Constants.expoConfig`
  is `{}`, `Linking.createURL()` needs a scheme mocked into `expo-constants`, and
  `Font.isLoaded()` is `false` until a font loads. `presets: { expo: true }` keeps the preset
  while a suite moves off it.
- **`require('./logo.png')` gives the asset's registered id,** as with Metro, not its file name.

With either engine:

- **Presets no longer export names the real package lacks.** Read `expoConfig` from
  `expo-constants`' default export, and `Animated.View` from Reanimated's default.
- **A `presets` array turns off auto-detection,** and under the native engine Gesture Handler's
  and FlashList's own Jest setup with it. To turn off one preset, use
  [`presets: { <name>: false }`](/guide/plugin-options#presets).
- **A preset of your own is listed by its path,** as in
  `presets: { './test/presets/my-lib.ts': true }`; a preset object passed in is refused.
- **Unistyles and Skia are mocked automatically.** Remove the `react-native-unistyles/mocks`
  setup file and any hand-written Skia mock.
- **`hotRuntime: true` fails at startup** with `HOT_RUNTIME_OVERRIDDEN` when a pool,
  `test.isolate` or a CLI flag conflicts with it, instead of overriding them.

The changelog has the rest: each release's Minor Changes from 0.10 on, "Upgrading from 0.13" in
0.14.0 and "Upgrading from 0.14" in 0.15.0.

### From 0.3 or older

0.3 ran the mock engine by default, a pure-JavaScript stand-in for React Native. Since 0.4,
`reactNative()` runs React Native's own JavaScript whenever `react-native`, its Babel preset (or
Expo's) and `@babel/core` are installed, as they are in a React Native or Expo app. Expect more
tests to change than from 0.9.

- To move a suite across in steps, set [`engine: 'mock'`](/guide/plugin-options#engine) to keep
  the mock engine, then remove it once the suite passes under the native engine. Under the mock
  engine, `useAnimatedValue`, `useAnimatedValueXY` and `useAnimatedColor` are now called inside
  a component, as in React Native.
- The [`mocks`](/guide/plugin-options#mocks) option applies to the mock engine only; the native
  engine stops with a configuration error when it is set. Use `vi.mock()` in a setup file or
  `mockNativeModule` instead.

The full list of changes is in the
[changelog](https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/CHANGELOG.md).
