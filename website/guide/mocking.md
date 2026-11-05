# Mocking

Three questions come up in almost every React Native suite: which mocking tool to reach for, what `vi.mock` actually reaches, and what to do about fake timers. This page answers each once; other pages link here.

## Which tool to use

| You want to replace… | Use |
|---|---|
| A native module (`NativeModules.X`, `TurboModuleRegistry.get('X')`) | [`mockNativeModule`](/guide/helpers#mocknativemodule-name-impl), under both engines |
| One export of React Native (`Alert`, `Linking`, …) | [`vi.mock('react-native', …)` with `importOriginal()`](#react-native-itself) |
| A library that has a [preset](/guide/presets) | Nothing: the preset is applied automatically. To change what it returns, see [overriding a preset](#overriding-a-preset) |
| Any other library, or your own module | `vi.mock('the-module', …)`, as in any Vitest project; [what it reaches](#what-vi-mock-reaches) |
| Existing `jest.mock(...)` calls | The [jest-compat layer](/guide/jest-compat), which hoists and applies them unchanged |

## React Native itself

`vi.mock('react-native')` works under both engines, including the `importOriginal()` form that keeps everything you don't name:

```ts
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  Alert: { alert: vi.fn() },
}))
```

Under the native engine this does **not** swap React Native for a mock: React Native still runs for real in Node, and your test and app code get a module that re-exports that same instance with your replacements on top. `Platform.OS` is still real, `<View>` still renders `RCTView`, and only the exports you replaced are yours.

## What `vi.mock` reaches

Under the **mock engine** everything loads through Vite, so `vi.mock` works as in any Vitest project.

Under the **native engine**, React Native and third-party React Native packages are loaded by Node rather than Vite. That decides what a `vi.mock` call can see:

| A `vi.mock` of… | Seen by your test and app code | Seen inside a third-party package |
|---|---|---|
| Your own module | Yes | — |
| `react-native` | Yes | No: a library's own `require('react-native')` gets the real one |
| A third-party package | Yes | No: another library's own `require` of it gets the real one |

So `vi.mock('rn-library')` replaces what your code imports from `rn-library`, and a library that depends on `rn-library` keeps the real one. The package's own test, `tests-native/ecosystem-inline.test.tsx`, checks both halves. Where the code under test reaches a module only through a library, mock below it: a [preset](/guide/presets), a [native module](/guide/helpers#mocknativemodule-name-impl), or the test on the mock engine.

### Overriding a preset

A preset replaces its library for your code and for other libraries alike. To change what it returns, `vi.mock` the module in a setup file and spread the preset's mock; `importOriginal()` returns the preset's module:

```ts
// vitest.setup.ts
vi.mock('@react-navigation/native', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ key: 'r', name: 'Screen', params: { id: '1' } }),
}))
```

For one-off changes, [`extendPresetMock`](/guide/helpers#extendpresetmock-pkg-overrides) is lighter. To run the real library instead, turn the preset off: `reactNative({ presets: { navigation: false } })`.

## Packages that ship untranspiled source

Most of the React Native ecosystem publishes JSX, Flow or TypeScript and leaves compiling it to Metro. Under the native engine:

- **Detected automatically.** Packages your project depends on that declare `react-native` as a dependency or peer dependency, and their runtime dependencies, are compiled with your project's React Native Babel preset. Nothing to configure, and no `transformIgnorePatterns`-style list to grow.
- **`transform.include` for the rest.** A package the detection misses (one that doesn't declare `react-native`) fails with a parse error naming its file. List it, and its own dependencies are compiled too:

  ```ts
  reactNative({ transform: ['some-untranspiled-lib'] })
  // the same, in the object form:
  reactNative({ transform: { include: ['some-untranspiled-lib'] } })
  ```

- **`transform.exclude` when the detection guesses wrong.** A package listed here is never compiled, whatever selected it: detection, another package's dependencies, or the engine's built-in lists. Use it when compiling a package fails, typically a build tool that loads Babel itself:

  ```ts
  reactNative({ transform: { exclude: ['some-build-tool'] } })
  ```

To see what was selected, run with `reactNative({ diagnostics: true })`: the `Node / native transform` line lists every package the engine compiles.

Packages a preset replaces are never compiled (their real source never loads), and neither is the test infrastructure (`@testing-library/react-native` and the renderers).

## Fake timers

React Native Testing Library's `waitFor`, `findBy*` and `userEvent` delays advance fake timers only through a `jest` they can see.

- **Native engine:** vitest-native gives RNTL a `jest` backed by `vi`, so `vi.useFakeTimers()` works with `waitFor`, `findBy*` and `userEvent` as it does under Jest. Nothing to configure.
- **Mock engine:** RNTL sees no `jest` unless you use the [jest-compat layer](/guide/jest-compat). Without it, `waitFor` and `findBy*` wait in real time while the fake clock stands still, and time out. Add jest-compat, or advance the clock yourself before querying: `await vi.advanceTimersByTimeAsync(ms)`, or `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` for user events.

Two details hold under both engines:

- When RNTL loads while fake timers are on (a setup file turned them on), it switches to real timers and back to capture the real ones. That reinstalls fake timers with the project's `test.fakeTimers` config and drops per-call options, as under Jest. Set options in `test.fakeTimers` or in a `beforeEach` rather than in a setup file's top level.
- `jest.useFakeTimers(options)` under jest-compat takes Jest's options; see [fake timers in jest-compat](/guide/jest-compat#fake-timers).

The hot runtime has [two more differences](/guide/troubleshooting#a-test-passes-on-its-own-but-fails-when-run-with-other-files) around fake timers.

Next: [Test Helpers](/guide/helpers).
