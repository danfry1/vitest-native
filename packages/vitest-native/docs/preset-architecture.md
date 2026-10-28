# Presets that use a library's own test support

Status: proposal (2026-10-27), revised after an adversarial review (see "What the review changed").

## The problem

A preset stands in for a React Native library a test cannot run as it is. The built-in
presets were written by hand, and a hand-written stand-in drifts: measured against each
library's own Jest mock, reanimated's preset lacked 104 names, gesture-handler's 36,
safe-area-context's 4, and several returned values the library never gives
(`tests/preset-library-mocks.test.ts` lists every gap).

Almost every one of these libraries already ships its own test support, which a Jest
suite wires up by hand:

| Library | What it ships for Jest | What it replaces |
|---|---|---|
| react-native-reanimated (4.7+) | `react-native-reanimated/mock`, `jest/resolver.js` | the package, with its own mock over the real JS |
| react-native-worklets (0.9+) | `jest/resolver.js` | nothing: the JS implementation runs |
| react-native-gesture-handler | `jestSetup.js` | its native module and host components; the JS is real |
| @shopify/flash-list | `jestSetup.js` | layout measurement; the list is real |
| react-native-safe-area-context | `jest/mock` | its hooks and provider, over the real package |
| expo-* modules | `mocks/<NativeModule>.ts` (generated), jest-expo's table | their native modules; the JS is real |

Three of these are already used, each by code written for that one library: Expo
modules' own mocks (#323), reanimated's mock and the two resolvers (#336). Each new
library would be another special case in the engine, and a user with a library of
their own has no way to do the same.

## The proposal

A preset declares, per package, which kind of test support the library ships, and the
engine handles each kind once. The hand-written `factory` stays, for the mock engine
and for libraries that ship nothing.

```ts
export default definePreset({
  name: "gestureHandler",
  modules: {
    "react-native-gesture-handler": {
      // Under the native engine: the real package, with the library's own setup file
      // run first (its jest.mock calls replace the native module and host components).
      native: { setupFiles: ["react-native-gesture-handler/jestSetup.js"] },
      // Under the mock engine, or where `native` cannot apply:
      exports: [...],
      factory: () => ({ ... }),
    },
  },
});
```

The `native` field takes one of three forms:

- `{ mock: "<pkg>/mock" }`: the package is the library's mock module, as
  `jest.mock(pkg, () => require(mock))` makes it. Export names are read from the mock
  file (`mockModuleExportNames`). Reanimated, safe-area-context.
- `{ setupFiles: [...] }`: the package runs as itself, after the library's setup files.
  Gesture-handler, flash-list.
- `{ asItself: true }`: the package runs as itself with nothing more. Worklets.

Alongside `native`:

- `jestResolver: "<pkg>/jest/resolver"`: the library's resolver, applied to requests
  from its files (`native/jest-resolvers.mjs`, today a fixed list of two).
- `requires: { "<pkg>": ">=4.7", ... }`: the versions the library's test support
  needs. Outside them, the `factory` serves, as for reanimated before 4.7 today.

Libraries' test support is written for Jest: setup files call `jest.mock`, and mocks
import `@jest/globals` (safe-area-context's) or call `jest.fn`. The engine runs them with
jest-compat's `jest` and its `@jest/globals`, whether or not the suite itself uses
jest-compat, the way it already serves Expo modules' generated mocks.

Each kind is one piece of engine code, tested once: the mock redirect, running a
library's setup files before the user's, the resolver bridge, the version gate. A
built-in preset becomes a short declaration, and so does a user's.

## Speed

Loading the real package beneath a library's mock costs about 80 ms per test file for
reanimated, 43% of it module resolution (778 resolves for 337 modules). The precompiled
registry (`native/registry.mjs`) already removes exactly that for React Native: its
graph is compiled once into lazy factories with every require resolved ahead of time,
which took a typical file from 59 ms to 14 ms. A package a preset declares with
`native` has its graph inlined into the registry the same way, resolved through its
`jestResolver`, so the cost of a library's own test support is paid once per build,
not per file. The registry's invariants hold as they do for React Native: one instance
per module across the registry boundary, lazy factories, and the hot worker's preload
order.

## Users' own presets

A user preset is the same declaration. For a library that ships a Jest mock:

```ts
// test/presets/my-lib.ts
import { definePreset } from "vitest-native/presets";
export default definePreset({
  name: "myLib",
  modules: { "my-lib": { native: { mock: "my-lib/jest/mock" } } },
});
```

`definePreset` checks the declaration's shape at load and types it. The mock engine
needs a `factory` as before; under the native engine the declaration alone is enough.
The drift gate (`tests/preset-library-mocks.test.ts`) is available for any preset that
names a library mock.

## What the review changed

Probing the installed libraries under the native engine found the direction sound and the
mechanism above incomplete:

- **jest-compat's `jest` does not reach a library's files.** At runtime `jest.mock` is
  `vi.mock`, which never reaches Node's `require`, and `jestMockTransform` does not run on
  node_modules. A library setup file has to be given a `jest` scoped to that file, whose
  `mock(spec, factory)` registers in the Node-side registry keyed from the file
  (`jest-compat/node-registry.mjs`); with that, gesture-handler's `jestSetup.js` renders the
  real gesture-handler over real React Native, and a press fires `onPress`. The same gap
  means a migrated suite's `import 'react-native-gesture-handler/jestSetup'` does nothing
  today. The scoped `jest` is passed to library code only, never as `globalThis.jest`:
  RNTL and other code read `typeof jest` to choose their behaviour.
- **A package that runs as itself loads twice.** `import` resolves through the package's
  `react-native` field (`src/`) and `require` through `main` (`lib/`), so a context created
  by one copy is not the other's: safe-area's hooks, required by a Node-owned library,
  threw "No safe area value available" under a provider the test imported. A package that
  runs as itself needs one entry for both graphs. As built, a bare require of a package
  with a `react-native` field (and no `exports`) resolves that field: the file Vite's
  import and Metro resolve, and the build libraries' own Jest setup targets
  (gesture-handler's mocks `./src/...`). tests-native/one-instance-per-package.test.ts
  holds it. `{ mock }` packages are shadowed by name in both graphs and do not have this.
- **`{ mock }` needs three engine pieces** for safe-area-context: `@jest/globals` for
  requests from declared packages' files on the Node side; a `requireActual` that bypasses
  a preset's name shadow (today `jest.requireActual('react-native-safe-area-context')`
  returns the preset); and an export selector, since that mock's module is its `default`.
  Expo's generated mocks are plain data and never needed any of this.
- **Worklets ships a mock, and gesture-handler needs it.** Gesture-handler's
  reanimated wrapper calls `getUIRuntimeHolder()`, which worklets' JS implementation throws
  for in a microtask, failing every file. Worklets on its own `mock.js` fixes it, and
  reanimated's mock still works over it. Libraries' support combines across packages.
- **Library mocks keep their implementations through a reset.** A mock built with `jest.fn().mockImplementation()`
  loses its implementation on `vi.resetAllMocks()` / `mockReset: true`, as Jest's
  `resetMocks` would drop it, which would break a guarantee the presets give (#278/#287). The scoped `jest.fn`
  takes the implementation a library mock installs while it is built as the mock's reset
  baseline, and the reset gate covers library mocks.
- **Speed: Jest parity, not free.** Evaluation stays per file (about 30 ms each for
  reanimated's mock and gesture-handler, 12 ms for flash-list, with resolution warm),
  because their graphs evaluate eagerly. Registry inlining would remove resolution, but
  needs ESM-to-CommonJS compilation of these packages, the library resolvers in its walk,
  name-shadowed requires preserved, an ESM facade per package and its versions in the
  cache key; it is measured before it is built, last.
- **Gate on files, not versions.** Only reanimated and worklets need a gate (their
  resolvers appear in 4.7 and 0.9), probed by file from the right directory (worklets from
  reanimated's); a native-engine fallback to the hand-written factory is reported once,
  and by `doctor`.
- **Internal first.** The declaration combines forms per package and across packages, so
  its shape is settled on the built-in presets before any of it is public. The public
  surface may end up being "the library's Jest setup or mock lines, with Jest semantics".

## Limits found while building

- A library's `jest.mock` reaches a module through Node's CommonJS loader. A package
  that runs as a native ES module (one vitest-native does not compile, such as a package
  the project does not declare) imports its modules past it, so a setup file's mocks do
  not apply there.

## Order of work

1. **The Jest-semantics primitive** for library code: a scoped `jest` (`mock`,
   `requireActual` that bypasses shadows, `fn` whose built implementation is the reset
   baseline), file-keyed Node registration, and `@jest/globals` for declared packages.
   It also makes a migrated suite's own library setup imports work.
2. **One entry for both graphs** for packages that run as themselves, with a gate.
3. **The `{ mock }` libraries**: worklets, safe-area-context, keyboard-controller,
   bottom-sheet, netinfo (reanimated is done), each measured against Jest with the
   library's own mock, and the drift gate's lists emptied as they move.
4. **gesture-handler and flash-list** on their setup files, tested together with
   reanimated and worklets, measured against Jest.
5. **Registry inlining**, only if the 24-file benchmark shows it is worth the work above.
6. Docs: the preset guide's "Your own presets" section, once the shape is public.

## Not proposed

- Discovering a library's test support automatically: whether a mock applies is the
  library's documented choice, and guessing it from file names would serve a mock a
  library did not intend for this.
- Running the libraries' setup files under the mock engine: it has no real React Native
  for the real packages to run on.
