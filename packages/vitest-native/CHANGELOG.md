# vitest-native

## 0.9.0

### Minor Changes

- a6a6ae3: The mock engine's Animated is now a live node graph, matching real React Native's semantics (previously it was a snapshot system — the largest known fidelity gap, and the class real-app bake-offs had to monkeypatch around).

  - **Derived nodes are live.** `interpolate()` (numeric AND string), `add`/`subtract`/`multiply`/`divide`/`modulo`, and `diffClamp` recompute from their sources on every read and re-notify listeners when any source moves. Numeric interpolations chain; derived nodes are valid operands (previously coerced to 0); chaining off a string interpolation still throws like RN.
  - **Animated components re-render.** `Animated.View`/`Text`/`Image`/`ScrollView`/`FlatList`/`SectionList` and `createAnimatedComponent` wrappers subscribe to every node in their style — a `setValue()` or `timing().start()` after render updates the rendered style, so `toHaveStyle` assertions see current values. Gated against real React Native by three new crosscheck probes (post-render `setValue`, live interpolation, live transform) — the corpus is now 78/78.
  - **Offsets are real.** `setOffset`/`flattenOffset`/`extractOffset` implement RN's semantics (the canonical PanResponder drag pattern) on `Value` and `ValueXY`; `ValueXY.addListener` now reports the joint `{x, y}` value.
  - **`__getValue()` exists on plain values** (RN's own tests call it), and `AnimatedValueXY`/`AnimatedColor` gained `__getValue`/`getValue` parity.
  - **`useAnimatedValue`/`useAnimatedValueXY`/`useAnimatedColor` are real hooks**: the value is `useRef`-memoized and survives re-renders (previously every render minted a fresh node, silently resetting animation state — and rebuilt the entire Animated namespace to do it). Consequently they must now be called inside a component, exactly like on-device.

- 1a3bcea: New CLI: `npx vitest-native init | doctor | migrate`.

  - **`init`** writes a ready-to-run Vitest config (`--jest-compat` for the exact jest-compat block the migration guide documents; refuses to overwrite without `--force`).
  - **`doctor`** diagnoses the environment read-only: Node floor (including the RNTL 14 ⇄ Node 22.13 interaction, which previously surfaced only as a raw runtime failure), required peers against supported ranges, which engine `auto` resolves to and why, every auto-detected preset, Expo presence with known-limits pointer, and config presence. Exits non-zero on blocking problems.
  - **`migrate`** analyzes the project's Jest configuration (`package.json#jest` or `jest.config.{js,cjs,json}`) and reports key-by-key what maps automatically (setup files, path aliases, `transformIgnorePatterns` allowlists → `transform: [...]`, timeouts, mock hygiene flags), what the auto-detected presets already cover (deletable manual `__mocks__` and setup lines), what needs a human, and what drops — ending with a complete suggested config. Dry-run by default; `--write` saves it. Test files are never edited (`jestMockTransform()` handles top-level `jest.mock` at runtime).

  The packed-tarball consumer suite exercises the bin end-to-end (`npx vitest-native doctor|migrate`).

- 2d07b7a: Add a built-in `react-native-worklets` preset (auto-detected). Worklets is Reanimated's low-level runtime and is also imported directly by apps (e.g. `import { scheduleOnUI } from 'react-native-worklets'`). It ships a Jest mock at `react-native-worklets/lib/module/mock` that is ESM ending in `module.exports = …`; under the native engine React Native and its ecosystem are externalized, so requiring that file through Node throws `module is not defined in ES module scope` and takes down the whole test file. The preset shadows the package with a self-contained mock modelled on worklets' own `mock.js` API (schedulers run their worklet synchronously, matching the Reanimated preset), so worklets-using suites load and render without a hand-written mock.

### Patch Changes

- e49168e: Bound hot-runtime memory by default. When `hotRuntime` is enabled on the native engine and neither `memoryLimit` nor `recycleAfterFiles` is configured, a default per-worker memory ceiling of `clamp(totalmem * 0.25, 768MB, 1.5GB)` is now applied. Hot workers keep React Native resident and accumulate roughly 4 MB per file, so without a bound a long suite could grow toward OOM; the default lets multi-worker runs recycle a worker once it crosses the ceiling, keeping total memory bounded out of the box.

  An explicit `memoryLimit` or `recycleAfterFiles` is respected unchanged. Single-worker hot still cannot recycle (Vitest batches all files into one scheduler task), so the bound is inert there and the existing one-time "recycling INACTIVE" warning advises running with `maxWorkers >= 2`.

- 0d38401: Fix two `mock` engine divergences from real React Native, found by the behavioral cross-check:

  - `Pressable` now resolves function `style` and `children` (`({ pressed }) => …`) against its press state, matching real RN's resting render and updating while pressed. Previously the functions were passed through untouched, so the style was never applied and function children never rendered.
  - `processColor()` returns `undefined` for an unparseable color (matching real RN's normalizer) instead of coercing to opaque black.

  Also publishes the cross-check as a generated, drift-guarded fidelity report — a live badge and a docs page listing the full corpus and what is deliberately left ungated — and expands the corpus to 75 probes.

- 6c29566: Expand the "Migrating from Jest" guide with the empirically-derived limits of a real migration: a "Known limits" section covering assertions coupled to Jest's RN mock internals that don't port under a real-RN engine (`jest.spyOn(View.prototype, …)`, mocks of RN internal submodules, raw `source`-shape assertions, `jest.mock` nested in callbacks), an Expo-core caveat, and concrete guidance for the `transformIgnorePatterns` → `transform` allowlist (including the JSX-in-`.js` third-party-lib parse error and its fix).
- f6c4c5b: Provide `SourceCode.getConstants().scriptURL` at the native boundary. RN's `getDevServer` (`Libraries/Core/Devtools/getDevServer.js`) reads `scriptURL` and calls `.match()` on it; under the native engine the value was `undefined`, so `getDevServer` threw and took down any test whose module graph reached it. The boundary now returns a `file://` (bundled) URL for the `SourceCode` native module. It is deliberately not an `http(s)` URL: `getDevServer` only treats `http(s)` script URLs as a live dev server, so a `file://` value keeps `bundleLoadedFromServer` false — tests run as if loaded from a bundle rather than a Metro dev server, which prevents RN internals and third-party SDKs from believing they're connected to a packager and attempting real network I/O against `localhost:8081`. This mirrors the intent of RN's own Jest mock (which keeps that flag off).
- 4c567c1: Make native-engine turboStubs identity-stable and spy-able. Unmocked native modules were served by a Proxy that minted a fresh stub object on every property access and whose get trap never consulted the target — so `NativeModules.Foo !== NativeModules.Foo`, and `vi.spyOn(NativeModules.Foo, 'method')` silently recorded nothing (the spy landed on a throwaway object). Stubs are now memoized per module name in the shared boundary state (`NativeModules.Foo === TurboModuleRegistry.get('Foo')`, matching bridgeless RN), methods are memoized on first read, and explicitly-set properties win — so spies record and restore correctly. A `has` trap reports all properties present, consistent with the get trap's serve-anything behavior, which `vi.spyOn`'s existence check requires. Under the hot runtime, per-file overrides (spies, memoized methods) are cleared between files via the surgical-reset registry while stub identity is preserved for resident libraries holding references.
- 57f155d: Fix three silent resolution-fidelity gaps around deep (subpath) imports.

  - **`react-native` subpath default exports are now the leaf module.** `import Platform from 'react-native/Libraries/Utilities/Platform'` previously received the entire mock object as `Platform`, so `Platform.OS` was silently `undefined`. The virtual subpath modules (ESM) and the CJS bridge now derive the intended export from the subpath's basename and serve it as the default — CJS requires get Babel-interop shape (`{ __esModule, default }` via a live wrapper) so both `require('.../Platform').OS` and `_interopRequireDefault(...)` consumers work. Unknown leaves keep the previous whole-mock fallback.
  - **`react-native/package.json` (and preset `pkg/package.json`) resolve to the real manifest.** Version gates like `require('react-native/package.json').version` previously read the mock and got `undefined`. Both the Vite-graph and CJS-bridge interception now exempt the manifest; when the package is not installed, the previous mock fallback is kept rather than erroring.
  - **Preset shadowing now covers subpath imports.** `import Swipeable from 'react-native-gesture-handler/Swipeable'` (and CJS equivalents, including requires nested inside externalized third-party libraries) previously bypassed the preset mock entirely and loaded the package's real native-runtime code — or failed resolution outright on package versions that no longer ship the deep file. All three redirect layers (Vite plugin, ESM loader hook, CJS require hook) now match subpaths of preset packages and serve the mock export named by the subpath's leaf, falling back to the root mock. JSON and asset-extension subpaths are exempt so manifests and font/image files keep resolving from disk. CJS interop wrappers are memoized per specifier (keyed by the live mock set, so hot-runtime per-file rebuilds stay correct) to keep module identity stable across repeated requires.

- 3b1c396: Native-engine transform cache rework: project-local, content-keyed, lazy Babel.

  - **The transform disk cache moves from `os.tmpdir()` to the project's `node_modules/.cache/vitest-native/`** (tmpdir fallback when node_modules is absent or unwritable). tmpdir is ephemeral on CI runners — every job paid a full cold Babel transform of React Native's ~250-file boot graph — and macOS purges it periodically. The new location persists across runs and is restorable by standard CI dependency-cache actions. The V8 compile cache is colocated.
  - **Disk entries are keyed by content hash (platform + path + source), not mtime + size.** Content keys survive fresh installs, Docker mtime normalization, and CI cache restores — and eliminate the stale-hit class where a same-size, same-mtime file with different content served wrong executable code. The path stays in the key because Babel's output embeds the filename (`_jsxFileName` in transformed JSX), so identical sources at different paths must not share an entry; restores are valid wherever the checkout path is stable, which CI workspaces are. The cache directory name now also carries the `@babel/core` version alongside the preset version, so a Babel upgrade invalidates cleanly.
  - **`@babel/core` loads lazily, only on a cache miss.** Loading Babel costs ~35ms vs ~0.5ms for the resolve-only version check, and under the default engine every isolated worker paid it even when every file came from the disk cache. Measured on the package's own native suite (warm cache): aggregate worker setup down ~30%, wall clock ~11% — the effect scales with test-file count.

- 091a572: Three hardening fixes:

  - **Prerelease peer versions no longer fail validation.** A prerelease sharing the minimum's major.minor (e.g. vitest `4.0.0-beta.3` against the `4.0.0` floor) parsed with `NaN` in the patch slot, failed the minimum check, and hard-errored at startup for installs running betas/RCs. Prerelease/build metadata is now stripped before comparison; a prerelease of the minimum itself is accepted.
  - **Mock-engine asset stubs match the native loader's semantics.** The extension match is now case-insensitive (`LOGO.PNG` stubs like `logo.png`), user-supplied `assetExts` entries are regex-escaped, and the stubbed basename is JSON-stringified so filenames containing quotes emit valid JS.
  - **The mock engine's Flow-strip transform skips unparseable files instead of throwing.** The `@flow` filter is a heuristic — the marker can appear inside a string or comment of a file `flow-remove-types` then fails to parse; that parse error previously took down the whole transform pipeline.

- a756f6a: Make `jest.requireActual('react-native')` return a writable facade. Jest suites commonly clone-and-override React Native — `const RN = jest.requireActual('react-native'); RN.Platform = {...}; return RN`. Under the native engine RN's index is a facade of lazy getters with no setters, so assigning to it threw `Cannot set property … which has only a getter` and failed to load the whole test file. `requireActual('react-native')` now returns a write-through proxy: reads fall through to the real (lazy) facade, and assignments are captured so the override wins on later reads — matching Jest's mutable module. Only `react-native` is wrapped; its submodules and other packages are ordinary mutable CommonJS.

## 0.8.0

### Minor Changes

- 067e2aa: Add built-in presets for `@shopify/flash-list`, `@gorhom/bottom-sheet`, and `react-native-keyboard-controller`.

  These libraries rely on native runtimes (a native recycler, reanimated worklets, and keyboard native modules) that cannot run under Node, so before this they had to be mocked by hand. Each is now auto-detected when installed and shadowed by a self-contained preset under both engines: `FlashList` renders its data through `renderItem` so rows stay queryable, the bottom-sheet containers render their children through real React Native with no-op imperative refs, and the keyboard-controller containers render their children while `KeyboardController` and the reanimated-backed hooks return inert handles.

- b31e3d9: Support `@testing-library/react-native` 14 alongside 12 and 13.

  RNTL 14 made `render`, `fireEvent`, and `act` asynchronous and reconciles with the new
  `test-renderer` (replacing `react-test-renderer`). Two changes make the native engine work
  across the full supported peer range (`>=12 <15`) from a single setup:

  - Register `RCTVirtualText` as a text host under the native engine. Real React Native renders a
    nested `<Text>` as the host `RCTVirtualText`, which RNTL 14's `test-renderer` did not recognize
    as text — so any composite or nested `<Text>` threw "Text strings must be rendered within a
    `<Text>` component". Nested and composite text now render and match correctly.
  - The engine itself is RNTL-version agnostic; the only caller-visible difference is that RNTL 14's
    `render`/`fireEvent`/`act` must be awaited. Awaiting them is back-compatible with RNTL 12/13,
    where the calls are synchronous.

  CI now exercises RNTL 12, 13, and 14. Note that RNTL 14 requires Node >= 22.13; on Node 20, use
  RNTL 13.

### Patch Changes

- 489a536: Scope React Native path detection to `node_modules`. The native engine identified
  React Native package files with the regex `/[\\/]react-native[\\/]/`, which also
  matched any project checked out under a directory named `react-native` (for example
  `/home/runner/work/react-native/react-native/` in CI for a repo named `react-native`).
  Every project file then matched, so `.tsx` test files were externalized and sent raw
  to Node (`Unknown file extension ".tsx"`) and `vi.mock()` calls stopped hoisting.
  The matchers in `apply.ts`, `loader.mjs`, and `hooks.mjs` now require a
  `node_modules/` segment, which still matches real RN and `@react-native/*` packages
  (including pnpm-nested layouts) without false-matching project paths. Reported and fixed
  by [@Doko-Demo-Doa](https://github.com/Doko-Demo-Doa) (#50).
- 5eaf8cb: Cache the React Native graph's compiled bytecode under the native engine.

  With per-file isolation (`engine: 'native'`, the default), React Native's module graph is re-instantiated for every test file, recompiling its source to V8 bytecode each time. The native engine now enables Node's on-disk compile cache (Node 22.8+) before React Native is loaded, so subsequent compilations across files, workers, and runs reuse cached bytecode. Measured on a 100-file suite (single worker), this reduced cold time by ~7% and warm time by ~7-18% with tighter run-to-run variance and no change in memory use. It is a no-op on Node versions without the compile-cache API.

## 0.7.0

### Minor Changes

- 37c8123: Native engine: Metro-style resolution for externalized node_modules packages, plus navigation route params and jest-compat timer leniency

  Vitest externalizes most `node_modules` dependencies (any that Node can import
  natively), so they load through Node rather than Vite — and Node's resolver has no
  notion of React Native's Metro conventions. The native engine now fills those gaps
  for externalized packages:

  - **Platform extensions** — `import './x'` resolves `x.native.js` / `x.ios.js` /
    `x.android.js` over the default `x.js`, for any `node_modules` package (matching
    Metro and Vite's behavior for inlined code). Previously only `react-native` and
    packages in `transform` got this, so e.g. `@react-navigation` silently loaded its
    web variant (`useLinking.js`), breaking the navigation lifecycle with no error.
  - **Asset imports** — `import icon from './icon.png'` (and other asset extensions)
    resolve to the basename string instead of throwing "Unknown file extension" in
    Node's ESM loader.
  - **JSON imports** — `import data from './data.json'` without a `with { type: 'json' }`
    attribute no longer throws `ERR_IMPORT_ATTRIBUTE_MISSING` on Node 22+. The native
    engine injects the attribute so Node's own JSON module loader handles it.

  Other changes:

  - **`navigation` preset** accepts `defaultRouteParams`, used by the mocked
    `useRoute().params` (and as a `<Screen>`'s fallback params) — so components that
    read route params at mount can be tested without a custom `vi.mock`.
  - **jest-compat** `jest.advanceTimersByTime` / `advanceTimersByTimeAsync` are now
    no-ops when fake timers are inactive, matching Jest's lenient behavior (Vitest's
    `vi` throws). This fixes RNTL `userEvent.setup({ advanceTimers })` on suites that
    never enable fake timers. All other `jest` methods continue to forward to `vi`.

### Patch Changes

- 5a86872: Add mocks for react-native 0.86 top-level exports

  The weekly compatibility check flagged new stable exports in react-native 0.86.
  `EventEmitter`, `useAnimatedColor`, and `useAnimatedValueXY` are now mocked so
  named imports resolve under the mock engine. The experimental virtualized-collection
  API (`unstable_VirtualRow`, `unstable_createVirtualCollectionView`, and related)
  is added to the compatibility check's known-skipped list.

## 0.6.1

### Patch Changes

- 40a5147: Native engine: fix `import { Appearance } from 'react-native'` (and other lazy-getter RN exports) failing with "does not provide an export named …" when the import comes from an **externalized ESM dependency**.

  React Native's index exposes everything via lazy getters (`module.exports = { get Appearance() {…} }`), which `cjs-module-lexer` can't surface as named exports when Node imports the CommonJS module from the ESM graph. The Node ESM loader now serves RN's main index as a thin re-export of the real (Flow-stripped) module plus a `cjs-module-lexer`-recognized export hint, so named imports resolve while the real getters stay lazy (no eager load of RN's surface). The `require('react-native')` path is unchanged.

  Previously this needed a manual `transform: ['the-lib']` workaround (e.g. for `uniwind`); that's no longer required. Surfaced by the obytes-template bake-off.

## 0.6.0

### Minor Changes

- 3297e5b: Add a built-in `vectorIcons` preset for `@react-native-vector-icons` (v10+),
  auto-detected like the other third-party presets.

  The library's v10 icon sets (`@react-native-vector-icons/material-icons`, …) are
  all built on the shared `@react-native-vector-icons/common` module, whose dynamic
  font loader runs at import time and queries the native `ExpoFontLoader` — which
  cannot exist in Node. Without shadowing, importing any icon set throws and the set
  is wrongly reported "not available", so icons render nothing. The preset shadows
  the single `common` module (the way jest mocks vector-icons) so `createIconSet(...)`
  returns a lightweight Text-based stub that forwards `name`/`size`/`color`/`style`/
  `testID` — fixing every icon set at once. The legacy `react-native-vector-icons`
  package is mapped to the same preset.

  Surfaced by the `@rneui/base` bake-off, where every `Icon` test failure traced to
  this import-time crash.

### Patch Changes

- e333954: Fix two `Animated` mock fidelity gaps surfaced by the mock-vs-real-RN cross-check:

  - `Animated.Text` (and the other `Animated.*` components) now render the base host
    component (`Text`, `View`, …) instead of a host literally named `Animated.Text`,
    so RNTL's `getByText`/`queryByText` can find their text children — matching real
    React Native.
  - An `Animated.Value` (or interpolation/color node) used in a `style` prop now
    resolves to its current value on the host's style, so assertions like
    `toHaveStyle({ opacity: 0.3 })` against `new Animated.Value(0.3)` pass — matching
    how real React Native writes the live value onto the host.

- Restore Vitest 4.0.x compatibility in the hot-runtime runner. 0.5.0 imported `TestRunner` from the `vitest` main entry, which only exists in 4.1+; on 4.0.x the hot runner threw `Class extends value undefined`. It now prefers the main-entry export and falls back to the (deprecated) `vitest/runners` subpath only when the main export is absent — so 4.1+ stays warning-free and 4.0.x works again.
- 3297e5b: Native engine: stub asset `require()`s reaching Node's CJS loader. A literal
  `const img = require('./logo.png')` or `require('./Icon.ttf')` (common in real RN
  components) escapes Vite's asset handling and hits Node's loader, where the binary
  was compiled as JS and threw `SyntaxError: Invalid or unexpected token`, taking
  down the whole test file. The Node require-hook now stubs asset extensions
  (images, media, and fonts) to their basename string, matching the Vite graph and
  Metro/Jest behaviour.

  Surfaced by a real bake-off of the `@rneui/base` (react-native-elements) Jest +
  RNTL suite under the native engine.

## 0.5.0

### Native engine

- Propagate the configured iOS/Android platform through native resolution,
  transformation caches, Babel caller metadata, and native boundary constants.
- Bring assets, helper controls, native-module injection, animated matchers, and
  snapshot serialization to the native engine contract.
- Reject mock-only `mocks` overrides under the native engine instead of silently
  ignoring them.

### Mock engine

- Block `onPress` on disabled `Pressable`/`Touchable*`/`Button` under
  `@testing-library/react-native` v14. RNTL 14 resolves press handlers by walking
  the composite fiber, which re-finds `onPress` on the wrapping `forwardRef` mock,
  so the earlier host-prop stripping no longer blocked the press; disabled hosts
  are now marked `pointerEvents: "none"` so RNTL's `isEventEnabled` rejects it
  (no-op under RNTL ≤13). Thanks @jakeboone02.
- Stop passing the `hostComponentNames` option to `configure()` on RNTL ≥14,
  which removed it in favor of auto-detection; this silences an "Unknown
  option(s) passed to configure" warning while preserving the option for
  RNTL ≤13.

### Reliability

- Fix hot-runtime cross-file leaks from import-time globals, direct environment
  mutations, and app-owned RN event listeners.
- Add a dedicated one-worker hot-isolation gate, a generated 100-file soak,
  end-to-end memory-triggered worker recycling, and Android platform-resolution
  coverage.
- Validate plugin and hot-runtime options eagerly with actionable errors.
- Fail configuration for unsupported required Vite, Vitest, and React peers
  instead of continuing after a console error.

### Compatibility and release engineering

- Validate packed release tarballs in bare RN 0.83/RNTL 12, Expo 56/RNTL 13,
  Vite 8 monorepo/RNTL 14, RN 0.86 Android, and a mock-engine RNTL 14 consumer
  (the combination that guards the disabled-press fix above).
- Support Vite 8's Oxc JSX configuration without the deprecated `esbuild`
  option, while retaining Vite 6–7 support.
- Load RNTL matchers across the public, `build`, and `dist` layouts used by
  RNTL 12–14, and expose Vitest's `expect` for RNTL matcher registration without
  enabling all Vitest globals.
- Upgrade the validated baseline to Vitest 4.1.8, RN 0.85.3, and React 19.2,
  with exact peer upper bounds for unsupported future majors.
- Require patched Vite floors (^6.4.2, ^7.3.2, or ^8.0.5) and refresh build
  tooling/transitive resolutions to remove known high-severity advisories.
- Make Linux Node 20/22, macOS, Windows, packed consumers, the example app,
  soak tests, cross-checks, and package export analysis blocking release gates.

## 0.4.1

### Patch Changes

Documentation fixes (the README is consumers' primary reference):

- **Quick Start now runs as written.** It used bare `test()`/`expect()` with no
  import, but the plugin does not enable Vitest globals — copying it produced
  `test is not defined`. Added the `import { test, expect } from 'vitest'` and a
  note on the `globals: true` alternative.
- **Installation** notes the companion dependencies the examples need
  (`@testing-library/react-native`; a real RN app already provides `react-native`
  - `@react-native/babel-preset` + `@babel/core`).
- Corrected the RN-conformance count (118 ported: 115 passing, 3 documented skips).
- "Spiritual successor" → "Maintained successor" wording, with a migration link.

## 0.4.0

**The native engine is now the zero-config default.** `reactNative()` with no
options runs your tests against **real React Native** — the same JavaScript that
ships in your app — mocking only the native-module boundary. The pure-JS mock
engine remains as an explicit opt-in (`engine: 'mock'`). vitest-native positions
itself as the maintained continuation of
[`vitest-community/vitest-react-native`](https://github.com/vitest-community/vitest-react-native).

> Beta. The native engine is validated against real apps (react-native-paper, the
> obytes template, Rocket.Chat) across React Native 0.81–0.84, with a CI-gated
> behavioral cross-check against real RN. Some APIs may still shift before 1.0.

### Breaking Changes

- **`engine: 'auto'` (the default) now resolves to `'native'`** whenever
  `@react-native/babel-preset` and `@babel/core` are present — i.e. in any real RN
  app. It falls back to `'mock'` only when those deps are absent, printing one line
  to explain why. Previously `auto` always resolved to `mock`. Set
  `engine: 'mock'` to keep the old behavior.

### Native engine

- **Boundary hardening.** The native-module stub now honors RN's calling
  conventions it previously broke: callback-style methods invoke the success
  callback instead of hanging (fixes `AccessibilityInfo.*`, `Share.share`), and
  promise-returning methods return a real `Promise` (fixes `Linking.canOpenURL`/
  `openURL`, `Image.prefetch`/`getSize`). Backed by app-shaped stress suites
  (`tests-native/stress*.test.tsx`) as a permanent regression gate.
- **`isolate: true` is the native-engine default** — the safe Vitest default.
  Adversarial testing proved `isolate: false` leaks state across files at scale.
  An opt-in **hot runtime** (`reactNative({ hotRuntime: true })`) reclaims the
  speed safely via surgical per-file reset, for large suites.
- **`transform` allowlist** — extra `node_modules` packages whose untranspiled
  source the native engine should strip (Flow/TS/JSX) as it loads them, for
  third-party RN libraries (analogous to Jest's `transformIgnorePatterns`).
- **Presets apply under the native engine**, shadowing each library's native
  runtime (worklets, native modules) the way Jest does — including transitively
  imported presets — while the surrounding tree renders through real RN.
- **Expo**: the `expo` preset shadows the common Expo modules under the native
  engine (gated proof in `tests-native/expo.test.tsx`).

### Trust & tooling

- **Cross-check** — a CI-gated behavioral differential that runs the same probes
  under `mock` and `native` and diffs them against real RN as the oracle. It is
  how mock fidelity is proven (and it found two of the mock fixes below).
- **Vitest × RN CI matrix** — gates the native engine across RN 0.81–0.84 ×
  Vitest {pinned, latest}, with the latest-Vitest column as a non-blocking canary.
- **Jest migration tooling** — a `vitest-native/jest-compat` entry (the `jest`
  global, `@jest/globals`, jest-native extend-expect) plus auto-hoisting of
  top-level `jest.mock` → `vi.mock` and automatic JSX runtime. Guides:
  `docs/migrating-from-jest.md` and `docs/migrating-from-vitest-react-native.md`.

### Presets & matchers

- `react-native-gesture-handler` preset now exports `Pressable` (mirroring RN's,
  including suppressing press handlers when `disabled`).
- `toHaveAnimatedStyle` / `toHaveAnimatedProps` are auto-registered on `expect()`,
  replacing reanimated's Jest-only `setUpTests()` matchers. Opt into types with
  `"types": ["vitest-native/matchers"]`.
- New presets: `react-native-device-info`, `react-native-mmkv`, `react-native-svg`,
  `react-native-webview`; navigation preset covers drawer/bottom-tabs/elements.

### Mock-engine fidelity fixes

- Disabled `Pressable`/`Touchable` mocks now suppress press handlers.
- `StyleSheet.hairlineWidth` is derived from the pixel ratio (≈`1/3` at scale 3)
  instead of a hardcoded `0.5`, matching real RN.
- `Animated.Value.interpolate()` supports string output ranges (e.g.
  `["0deg", "360deg"]`, `["0%", "100%"]`), preserving the unit/suffix.

## 0.3.0

### Minor Changes

- Add RN conformance test suite — 75 tests ported from React Native's own test suite (Animated, processColor, flattenStyle, Interpolation) to validate mock behavioral parity
- Add Animated orchestration: `sequence` chains via callbacks, `parallel` waits for all, `loop` supports finite/indefinite iterations with `resetBeforeIteration`
- Add Animated value tracking: `timing`/`spring` with an `AnimatedValue` as `toValue` track source changes via listener
- Add Animated.Color, diffClamp tracking, interpolation extrapolate/easing, toJSON support
- Expand reanimated preset: 44 entering/exiting animations, 7 layout transitions, `useAnimatedReaction`, `useAnimatedKeyboard`, `useReducedMotion`, `useFrameCallback`, `makeMutable`, `SharedTransition`, `ReduceMotion`/`KeyboardState` enums
- Add `@react-navigation/drawer` preset with `createDrawerNavigator`
- Add `setInsets()` helper for safe area context testing
- Add inter-test isolation: `resetAllMocks()` now resets AsyncStorage store and safe area insets
- 1136 tests passing across 30 files

## 0.2.1

### Patch Changes

- Add missing `@react-navigation/core` re-exports to navigation preset, including `useNavigationContainerRef`, `useTheme`, `ThemeProvider`, `NavigationIndependentTree`, `useNavigationBuilder`, `BaseRouter`, and 20+ other exports. Fixes tests that depend on these being available from `@react-navigation/native`.

## 0.2.0

### Minor Changes

- Add Metro-compatible extensionless module resolution for node_modules. Add navigation preset mocks for @react-navigation/native-stack, @react-navigation/bottom-tabs, and @react-navigation/elements. Support custom presets.

## 0.1.3

### Patch Changes

- 260ae84: Fix package metadata: correct GitHub URLs and Node >= 20 engine requirement.
