# vitest-native

## 0.11.1

### Patch Changes

- ea133b6: Only walk the dependency closure of packages the project declares

  Fixes a regression in 0.11.0. In a workspace holding both a library and a React
  Native or Expo application — the canonical monorepo shape — the application's mere
  presence could stop the library's tests from loading:

  ```
  ReferenceError: [vitest-native] Failed to transform '@babel/runtime' … for platform 'ios'.
  Caused by: ReferenceError: Cannot access 'v' before initialization
  Test Files 1 failed | Tests: no tests
  ```

  0.11.0 began compiling a detected package's dependency closure, so that a library
  shipping untranspiled JSX inside a transitive dependency would work without naming it
  in `transform: [...]`. Candidates are collected from every manifest in the workspace,
  which is how a library the application depends on is found at all — but applied to a
  closure walk, that breadth stops being free. A sibling Expo application is detected on
  its own manifest, and walking its dependencies pulled the entire Expo and Metro
  toolchain into the Babel transform set of a package that depends on none of it: over
  250 packages in a two-package reproduction, `@babel/runtime` and Metro's `lru-cache`
  chain among them.

  Those are not inert. React Native and Babel load them, and compiling the transform's
  own toolchain re-enters Babel while it is still initialising — which surfaces as a
  `Cannot access 'v' before initialization` naming files the project never mentioned.
  The existing toolchain exclusion covers what `@babel/core` reaches and so did not
  catch either of them.

  The closure now starts only from packages the run itself declares — the package under
  test, and any manifest above it, which is where a workspace keeping its React Native
  libraries at the repository root declares them. A package only a sibling declares is
  that sibling's business. Transitive compilation is unaffected: a dependency reached
  through the walk is declared by its own parent, which is what makes it transitive.

  Declaration rather than resolvability, deliberately: under pnpm every workspace member
  is linked into a hidden directory placed on `NODE_PATH`, so a sibling's dependencies
  do resolve from the package under test at run time, and testing reachability instead
  lets all of them straight back through.

  `@babel/runtime` and `metro` also now seed the toolchain exclusion, alongside
  `@babel/core` and the React Native Babel preset. Neither is reachable from
  `@babel/core`, so the existing exclusion let both through. `@babel/runtime` holds the
  helpers Babel _emits_, so compiled output across the ecosystem requires it at run
  time; Metro is the bundler the preset belongs to, and its `lru-cache` chain — the
  `yallist` in the report — is loaded the same way. This matters beyond the reported
  shape: an Expo application running its own tests declares `expo` legitimately, so its
  closure is walked and the same packages arrive by a route the change above does not
  affect.

  In the two-package reproduction the transform set drops from 253 packages to 5 — the
  declared dependency and its genuine closure. For an Expo application testing itself it
  drops from 251 to 171, with `@babel/runtime`, `yallist` and Metro's cache chain no
  longer among them.

  A closure member that publishes only ES modules is left alone as well. The walk is a
  guess that a detected package's dependencies might be untranspiled React Native
  source; `"type": "module"` with no `react-native` build anywhere in the manifest is
  the dependency saying the opposite. Compiling one anyway rewrote a package that
  publishes ESM into CommonJS and handed it to Node under that format. A genuine React
  Native library is unaffected — declaring `react-native`, by legacy field or by export
  condition at any depth, keeps it in the closure however it publishes — and so is any
  package named in `transform: [...]`, which was asked for explicitly.

## 0.11.0

### Minor Changes

- 912fb81: Add a `netInfo` preset for `@react-native-community/netinfo`

  NetInfo was detected and compiled correctly, and still failed at the native-module
  boundary. The generic stub answers any method with `undefined`; NetInfo awaits
  `getCurrentState()` and reads `state.isInternetReachable` off the result, so a test
  that called `NetInfo.fetch()` died on a TypeError and an unhandled rejection.

  No generic stub can infer that shape, which is what earns a preset. It is auto-detected
  like the others, and covers the package's real runtime surface: `configure`, `fetch`,
  `refresh`, `addEventListener`, `useNetInfo`, `useNetInfoInstance`, and the
  `NetInfoStateType` / `NetInfoCellularGeneration` enums — which are TypeScript enums
  re-exported through `export *`, so unlike the rest of that module they do have runtime
  bindings.

  The resting state is a connected wifi device. The real library starts at
  `{ type: 'unknown', isConnected: null }` and resolves to the device a moment later; a
  mock has no device, and a null resting state would send every component under test down
  its offline branch. Tests can drive it, and `resetAllMocks()` restores it.

  The package is now a devDependency, so the preset's declared exports are checked against
  the real package's TypeScript surface by the existing fidelity gate rather than trusted.

### Patch Changes

- f6e5a42: Check React Native API coverage on every pull request

  The mock engine is documented as covering every stable React Native export, and
  `check-compat` is the script that backs the claim: it parses the real `react-native`
  index and fails when a stable export has no mock.

  It ran only in the weekly compatibility workflow, and there against
  `react-native@latest`. The version actually pinned in the repository was never checked
  on a pull request. A change that moved the pinned React Native could add stable exports
  the mock did not cover and still go green, with the gap appearing days later as a
  canary failure against a different version.

  It now runs in the pull-request gate against the pinned React Native, on the one matrix
  leg where the React Native version is representative. The weekly canary keeps its own
  edge run — the two answer different questions.

  Currently 85 of 85 stable exports are covered.

- 12e1be3: Build with tsdown under bun's runtime

  tsdown's bin declares a Node shebang, and from 0.22 it calls `Promise.withResolvers` —
  an API Node did not ship until 21. Building on Node 20 therefore failed with
  `TypeError: Promise.withResolvers is not a function`, which blocked the dev-dependency
  updates that carry tsdown forward.

  `build` now invokes `bunx --bun tsdown`, so the bundler runs under bun's runtime, which
  has the API. The emitted `dist` is byte-identical either way, verified by hashing it
  from both runtimes against tsdown 0.21 and 0.22.

  This is a change to what the build toolchain runs on, not to what the package requires.
  The published `engines` floor of Node >= 20.19 is unchanged, and the Node 20 CI legs —
  which prove that floor and pin RNTL 12 and 13 as the lower-bound back-compat corners —
  keep running everything they ran before.

- c0b3bb3: `doctor` reports the real Node floor, and catches RNTL 14's missing peer

  Two cases where `doctor` said a project was fine while it was not.

  **The Node floor was hardcoded and compared on the major only.** It printed
  "floor: 20" and passed any Node 20.x, but the real floor moved to 20.19 — the version
  that added `require(esm)`, which the root entry point now depends on. Node 20.0 through
  20.18 were reported as supported. The floor is now read from this package's own
  `engines.node`, and compared as major and minor.

  **RNTL 14 declares `test-renderer` as a non-optional peer** and reconciles through it.
  Installing RNTL 14 without it is easy — npm only warns, and any `--legacy-peer-deps`
  install is silent — and the result is that every `render()` throws `Cannot find module
'test-renderer'`, naming no file and no package. `doctor` reported no blocking problems
  for exactly that project. It now fails with the install command. RNTL 13 is unaffected
  and is not asked for the package it does not use.

- d0fb6ba: Compile a detected package's dependencies too

  `react-native-modal` — and any package like it — failed to import under the native
  engine with a bare `SyntaxError: Unexpected token '<'`, naming no file and no package.

  Detection asks each package's own manifest whether it declares `react-native`. The
  untranspiled JSX was not in `react-native-modal`; it was in `react-native-animatable`,
  which that package depends on. Nothing in the project declares it, so it was never a
  candidate, and it names `react-native` in neither `dependencies` nor
  `peerDependencies`, so the manifest test would have rejected it anyway. The documented
  remedy, `transform: ['react-native-modal']`, does not help — only naming
  `react-native-animatable` does, and nothing told anyone that.

  A detected package's dependency closure is now compiled with it. Two exclusions keep
  that safe, and both compute themselves rather than being lists to maintain:

  - **React Native's own dependencies.** The precompiled registry reaches those through
    pre-resolved absolute paths, so Node owns them; inlining one would give the same
    package two owners and two instances.
  - **The transform's own toolchain closure.** The transform runs `@babel/core`, so
    inlining anything Babel reaches means loading it re-enters the transform while Babel
    is mid-load.

  Detection stays under a millisecond, and 120 isolated test files run in the same time
  as before.

- cb98e1e: Never treat the package under test as an ecosystem dependency

  Under `engine: 'native'` in a workspace, a test file's own
  `import { describe, it, expect } from 'vitest'` could fail to load with:

  ```
  Error: Vitest cannot be imported in a CommonJS module using require().
  Test Files 1 failed | Tests: no tests
  ```

  Auto-detection reads the manifests of every workspace member, so the package under
  test appears in the candidate set whenever a sibling — or the repository root —
  declares it as a dependency. It also declares React Native, because it _is_ React
  Native code, so it was detected as a third-party ecosystem package: its directory
  became a `server.deps.external` pattern, Vitest handed every file beneath it to Node,
  and the loader compiled them to CommonJS. A test file's `import` then became
  `require('vitest')`, which throws before a single test runs. Suites using Vitest
  globals instead reported a pass while still running through Node's graph.

  Because it depended on whether anything happened to declare the package, the failure
  appeared in one workspace package and not another with an identical config, and was
  easy to misattribute to the `react-native` export condition selecting a CommonJS build
  of some dependency. It reproduces with no such dependency in the graph.

  Two changes:

  - A package whose directory contains the run root is the project, not a dependency,
    and is excluded from detection — including when a detected sibling's dependency
    closure reaches it. Workspace libraries the project merely depends on are still
    detected, which is what keeps them to a single module instance.
  - A first-party test file is never externalized, even when it sits inside a workspace
    library that is legitimately detected — the case an Nx-style run from the repository
    root produces. Test entries belong to Vitest, not to Node. Both conventions are
    covered: `*.test.*` / `*.spec.*` names, and files under a `__tests__` directory.
  - The same directory anchor is skipped for a package named in `transform: [...]`,
    which never passes through detection. A migrated Jest `transformIgnorePatterns`
    list naming the project's own package produced the identical failure.
  - When the run root sits above the package under test, a `test.include` pattern
    pointing into that package now identifies it, so its own source stays in Vite's
    graph too rather than only its test entries. A pattern with nothing literal before
    its first wildcard — Vitest's default — says nothing about which package is the
    project and is ignored, so workspace libraries the run merely depends on are still
    detected.
  - `react` and `react-is` join the packages that are never claimed by detection,
    alongside the test library and the renderers. A package declaring `react` as a
    runtime dependency rather than a peer dependency pulled it into the closure walk,
    leaving the engine's most duplication-sensitive package externalized and compiled
    as though it were untranspiled React Native source.

  One case remains where a package can still end up in both graphs, and it is now
  reported rather than silent: when an installed React Native package depends on the
  very package whose tests are running, Node loads that package's source alongside
  Vite's copy, and module-level state stops being shared. The engine warns, naming the
  file and the package that required it. It cannot be resolved by choosing an owner —
  the dependency is usually declared but never loaded, and honouring it would put the
  project's own test files back in Node's graph.

  The ownership rule the engine follows is written down in the header of
  `native/apply.ts`.

  The consumer suite now runs the workspace library's own tests, from inside the package
  and from the workspace root, and the whole monorepo fixture is exercised under pnpm as
  well as npm.

- d7ffd0a: Invalidate the React Native registry when any baked-in dependency changes, not just React

  The precompiled registry inlines React Native's own graph and leaves everything else —
  `react`, `invariant`, `nullthrows`, `@babel/runtime`, `stacktrace-parser` and others —
  as a normal `require` at a **pre-resolved absolute path** compiled into the emitted
  file. Those paths are only correct while the packages they point at stay where they
  were, but only React Native's own files were pinned against change.

  A previous fix named `react` in the cache key after upgrading React produced a null
  React dispatcher and React Native singletons that no longer compared equal. That fixed
  one package out of eleven. Naming the rest in the key one at a time would be a list
  that rots — the next dependency added to React Native's graph would not be on it.

  The resolved external targets are now recorded in the registry's manifest alongside
  React Native's own files, so the existing size-and-mtime check covers them. That works
  for both `node_modules` layouts: under bun and pnpm a version change moves the path, so
  the stat fails; under a flat npm or yarn tree the path survives but the file changes.

  Eleven packages are pinned in this repository's build. Verified by changing `invariant`
  under a warm cache: the registry rebuilds, where before it was reused unchanged.

## 0.10.0

### Minor Changes

- f21986f: The mock engine's Animated surface now matches React Native's

  Nine members React Native has were missing from the mock, so valid React Native code
  calling any of them threw under `engine: 'mock'` while working under `engine: 'native'`:
  `Animated.Node`, `Animated.Event`, `Animated.Interpolation`, `attachNativeEvent`,
  `Value.track`, `Value.stopTracking`, `Value.animate`, `hasListeners` and `toJSON`. All
  are implemented, following React Native's own semantics — `track()` kicks the tracking
  node immediately and replaces any previous one, `animate()` stops a running animation
  before starting the next and reports completion, `toJSON()` returns the current value.

  `stopAnimation` and `resetAnimation` moved off the shared base class onto `Value` and
  `Color`, which is where React Native puts them. They were reaching interpolations,
  which are derived and cannot be animated.

  `getValue()` remains — it is not a React Native API, and real React Native exposes only
  `__getValue()` — but now warns once per process, because the same call throws under the
  native engine. Use `__getValue()` for code that must run on both. It is the only
  remaining difference in this surface, and is recorded on the published fidelity page.

- 261b9ef: Make every declared entry point loadable, and require Node >= 20.19

  `require("vitest-native")` threw. The package's `main`, the `require` condition of the
  root export, and the `require` conditions of `./setup` and `./presets` all pointed at
  transpiled CommonJS bundles that could not be loaded at all: the root re-exports the
  presets, every preset imports `vi` from vitest at module scope, and vitest throws when
  it is reached through `require()`. A previous release gated this and recorded the three
  entries as known-unloadable rather than fixing them.

  The fix is not to change how the presets are written. Node has loaded ES modules from
  `require()` since 20.19, and the ESM build was always fine — only the transpiled
  CommonJS build tripped vitest's guard. Those three subpaths now declare a single ESM
  target for both conditions, and the dead CommonJS bundles are no longer emitted.
  `const { reactNative, presets } = require("vitest-native")` works, on both the oldest
  and newest supported Node. No documented API changed.

  `engines` now requires Node >= 20.19.0, the version that added `require(esm)` and the
  oldest version the matrix has ever tested. The previous `>= 20` advertised support for
  Node 20.0–20.18, which was never exercised and where the root entry cannot be required.

  Two gates were extended to keep this fixed:

  - `tests/package-exports.test.ts` resolves and loads every subpath by specifier under
    both `require` and `import`, rather than only loading declared targets by path. The
    original defect was invisible from the path side, since `dist/index.mjs` loaded fine
    throughout.
  - `scripts/check-exports.mjs` no longer ignores `cjs-resolves-to-esm` package-wide.
    Subpaths that are ESM-only on purpose are declared explicitly and checked against the
    manifest in both directions; every other subpath is checked with the rule enforced, so
    a dual entry cannot quietly lose its CommonJS build. Deriving that split from the
    manifest was tried and rejected: removing a `.cjs` moved the entry into the excused
    bucket, and the gate stayed green on the defect it exists to catch.

- a70c9f2: `hotRuntime` now isolates modules per file instead of repairing them

  A hot worker stays alive across test files, which is where its speed comes from —
  a fresh worker costs roughly 200ms of boot, and that dominates a run at scale. What
  it kept along with the worker was state: everything Vitest externalizes lives in
  Node's require cache, outside the reach of Vitest's own per-file reset.

  The previous model kept those modules resident and undid their damage afterwards,
  from a boot snapshot plus a call-stack heuristic that attributed each listener to
  import phase or test phase. That was approximate by construction, and wrong for a
  whole class: a `node_modules` singleton mutated by one file stayed mutated for the
  next, where stock isolation gives every file a fresh copy.

  The engine now re-executes instead of repairing. Anything the worker loaded to
  bootstrap itself stays; anything a test file caused to load is dropped and runs again
  on the next file. That is affordable because of the precompiled registry —
  re-instantiating React Native costs about 4ms in a warm worker.

  Measured: the idiomatic parity suite runs 135/135 under both engines with zero
  hot-specific failures, at 11.1× the default engine's speed; against Jest at 200 files,
  2.54× with 3.4× less peak memory.

  React, the renderers and `@testing-library/react-native` stay resident deliberately.
  Test files reach them through ESM `import`, which caches them in a registry Node
  offers no way to invalidate, so dropping the CommonJS entry would not replace them —
  it would add a second copy, and the two halves of the test stack would stop
  recognising each other.

  **Known limit.** A package a test file `import`s, rather than `require`s, cannot be
  evicted; only the CommonJS cache can be reset. Packages the engine inlines are
  unaffected, since those live in Vitest's own graph.

  `hotRuntime` remains opt-in. Making it the default needs validation against real
  applications, not only this repository's suites.

- 0bee726: Presets no longer declare named exports the real package does not have

  A preset shadows a package: under the native engine the real source never loads, so
  whatever the preset lists in `exports` becomes that module's named-export surface.
  Four presets declared names the real package has never exported, which made the mock
  more permissive than reality — code importing those names passed under vitest-native
  and failed under Metro, the one divergence a green run cannot reveal.

  - `expo-constants` declared twelve properties of the default `Constants` object
    (`expoConfig`, `isDevice`, `manifest`, …) as named exports. They are now reachable
    only on the default, as in the real package, and the three enums the package really
    does export — `AppOwnership`, `ExecutionEnvironment`, `UserInterfaceIdiom` — are
    provided instead.
  - `react-native-reanimated` declared `View`, `Text`, `Image`, `ScrollView` and
    `FlatList`. These are properties of the default export (`Animated.View`) and remain
    available there.
  - `react-native-safe-area-context` declared `EdgeInsets`, `Rect` and `Metrics`, which
    are interfaces with no runtime binding.
  - `@shopify/flash-list` declared `ViewToken`, also an interface.

  A test now reads each preset package's real runtime surface with the TypeScript
  checker and fails when a preset declares a name that surface lacks. Names removed by
  a newer major of a package are kept deliberately, since presets are not pinned to one
  major; each is listed with the version it belongs to, and a stale entry that the
  package has regained is itself a failure.

  Suites that imported the removed names will need to read them from the default export
  or drop them — the same change their production code needs.

- a70c9f2: Add `vitest-native/rntl-matchers`: types for React Native Testing Library's matchers under Vitest

  RNTL's matchers run correctly under this plugin but had no types for it. RNTL declares
  them only for Jest — augmenting the global `jest` namespace and the `@jest/expect`
  module — and neither reaches Vitest's `Assertion`. Every `expect(el).toHaveTextContent(...)`,
  `toHaveStyle`, `toBeVisible`, `toBeOnTheScreen` and the rest was
  `Property 'x' does not exist on type 'Assertion<...>'` for anyone who typechecks, despite
  passing at runtime.

  Reference the new types entry once, anywhere in the project:

  ```ts
  /// <reference types="vitest-native/rntl-matchers" />
  ```

  or add `"vitest-native/rntl-matchers"` to `compilerOptions.types`.

  It is opt-in rather than folded into the main types because
  `@testing-library/react-native` is an optional peer. A type import of an absent package
  is invisible under `skipLibCheck: true`, React Native's own default, but reports `TS2307`
  under `skipLibCheck: false` — which would break projects using the mock engine without
  RNTL. A project that references nothing loads nothing: the file is not part of the
  TypeScript program unless asked for.

### Patch Changes

- a70c9f2: `toHaveAnimatedStyle` and `toHaveAnimatedProps` now throw for a value that is not a rendered element

  Both matchers returned `{ pass: false }` when handed something without a `props`
  object. Under `.not` that result is inverted, so
  `expect(null).not.toHaveAnimatedStyle({ opacity: 1 })` passed — a query that matched
  nothing, or a value of the wrong shape, produced a green assertion.

  They now throw with the same message, which `.not` cannot invert. This matches React
  Native Testing Library, whose `checkHostElement` raises for the same case rather than
  failing softly.

  The positive form still fails as before; only the negative form changes, from
  silently passing to reporting the wrong receiver.

- a70c9f2: Cross-check the Animated API surface, not just its behaviour

  Every existing probe pins a behaviour, which cannot catch a member the mock invents:
  code written against one passes under the mock engine and throws under the native
  engine, because real React Native has no such method. Comparing the two surfaces
  directly found five such members, and nine real React Native members the mock does not
  implement — the same trap in reverse, where valid React Native code throws under the
  mock.

  The corpus now compares the member lists of `Animated`, `Animated.Value`,
  `Animated.ValueXY` and interpolations under both engines. Today's divergences are
  enumerated in an allowlist so they are reviewed rather than invisible, and anything new
  on either side fails. They are also recorded in the published known-differences table:

  - Extra on the mock: `getValue()` on values and interpolations (real React Native
    exposes only the internal `__getValue()`), plus `resetAnimation()`/`stopAnimation()`
    on interpolations.
  - Missing from the mock: `Animated.Node`, `Animated.Event`, `Animated.Interpolation`,
    `attachNativeEvent`, `Value.track`, `Value.stopTracking`, `Value.animate`,
    `hasListeners`, `ValueXY.toJSON`.

- f21986f: Name the cause of two failures that used to arrive unexplained

  A suite calling `jest.mock()` without `jestMockTransform()` in its plugins now says so.
  Vitest only hoists mocks written on the `vi`/`vitest` identifier, so the call runs after
  the imports it is meant to intercept and the mock silently does not apply — the test
  fails comparing real output against expected mock output, with nothing pointing at the
  cause. Reported once per run, with the config line to add.

  Two resolvable copies of React are now reported at startup. React throws
  `Cannot read properties of null (reading 'use')` when hooks run through a second copy,
  which React Native Testing Library surfaces as a failure to detect host component names
  and attributes to "an issue with your configuration". The warning names both paths and
  which package pulled the second copy in. `resolve.dedupe` still prevents the common
  case; this covers the ones it cannot reach.

  Two existing messages also say more: an unknown `hotRuntime` option now suggests the
  closest valid name and lists them all, matching what the top-level option check already
  did, and the reanimated preset explains why a React Native component was unavailable
  instead of only stating that it was.

- f21986f: The fidelity page now states what the cross-check covers, and the corpus reaches further

  A matching probe count says how many comparisons pass, not how much of the mock they
  reach. It reached 9 of 27 mocked APIs, and the page listed 81 green ticks without
  mentioning that — a reader would reasonably infer broader coverage than existed. The
  page now reports the covered fraction and names every API and component no probe
  touches. It is computed when the page is generated, so it moves with the corpus instead
  of going stale.

  Four probes were added over the untouched surface, chosen where a difference would be a
  real mock bug rather than an unavoidable device difference: the full `Easing` curve set
  including `bezier` and the parameterised `elastic`/`back`/`bounce`, `InteractionManager`,
  and a `DeviceEventEmitter` round trip.

  That found one: `InteractionManager.runAfterInteractions()` runs its task synchronously
  under the mock engine, while real React Native defers it a tick. Both run it exactly
  once, so this is timing rather than behaviour — but a test asserting immediately after
  the call passes under the mock and fails under the native engine. It is now recorded as
  a known difference; awaiting a tick, or using a `findBy*` query, works under both.

- 79e8b16: `doctor` now reports whether the config actually uses the plugin

  The config check was a substring test for "vitest-native", so a config whose only
  mention was a `// TODO: migrate to vitest-native` comment reported "uses
  vitest-native" and "No blocking problems found" — on a project where every React
  Native import fails. A config that imports the plugin but never adds it to
  `plugins: [...]`, or where the import has been commented out, read the same way.
  Diagnosing exactly that is the command's purpose.

  The check now reads the import, takes the binding name from it so an aliased import
  still counts, and confirms that binding is called. Import forms it does not recognise
  are accepted rather than risking a false alarm on a working project.

  `vite.config.*` is also recognised now. Vitest reads it when there is no
  `vitest.config.*`, but it was missing from the list, so a correct setup was told to
  run `vitest-native init` — advice that writes a second config which then takes
  precedence over the working one.

- b62e24f: `doctor` reports the run, not the directory it was typed in

  Two false reports from a workspace migration.

  Peers and engine detection resolved from the working directory. That is frequently
  not where the Vitest config lives, and under pnpm a package's node_modules holds only
  its declared dependencies — so a hoisted `@react-native/babel-preset` does not
  resolve from the package even though the real run finds it. `doctor` announced
  "engine 'auto' resolves to MOCK" for a project whose run banner said native.

  Resolution still happens from the directory the command was invoked in, which sees
  the most: Node resolution walks upward, so that directory already reaches its own
  dependencies and everything declared above it. The nearest directory holding both a
  Vitest config and a manifest is consulted only when something does not resolve there
  — the case where the command was run above the package that declares it — and the
  report says when it fell back.

  A config that builds on a shared one — common in a workspace — was also reported as
  not referencing vitest-native. It legitimately never mentions it, because the plugin
  is wired up in the package it extends. That case is now described rather than warned
  about, since this cannot tell from the file alone.

- a70c9f2: `doctor` no longer reports a blocking problem for an optional peer it does not block on

  A `@testing-library/react-native` version outside the supported range made `doctor`
  print "Blocking problems found" and exit non-zero. The plugin does not block on it —
  RNTL is an optional peer, and a version outside the range is a `console.warn` there
  — so a project that runs its tests fine could still fail a `doctor` check. It is now
  reported as a warning, matching what actually happens at run time. The genuine
  blocker in that area is unchanged: RNTL 14 on a Node below 22.13 still fails, because
  RNTL 14 declares `engines: ^22.13.0 || >=24`.

  The supported range was also written three times — in this package's
  `peerDependencies`, in the plugin's startup check, and again as a hardcoded major
  comparison inside `doctor` — with nothing holding them together. It now comes from
  the same table the other peers use, and a test asserts that table against the
  published `peerDependencies` so the two cannot drift apart.

- b773a2d: Auto-detected CommonJS packages expose all of their named exports again

  Node decides a CommonJS module's named exports with `cjs-module-lexer`, which reads
  the source statically and stops at shapes it cannot follow. Given ordinary
  hand-written CommonJS:

  ```js
  module.exports = { Banner({ label }) {}, renderCount: () => n };
  ```

  Node reports the named exports as `["Banner", "default", "module.exports"]` —
  `renderCount` is missing, and a name that is not an export appears. That is plain
  Node behaviour, reproducible with no plugin involved.

  It became reachable when auto-detected React Native packages moved from Vite's graph,
  whose interop enumerates the real object at run time, into Node's. `import { useFoo }
from 'some-rn-lib'` could then fail with "does not provide an export named", for the
  hand-written CommonJS libraries auto-detection exists to support.

  Transformed packages are now served with the dead `0 && (module.exports = { … })`
  hint that the lexer does understand — the same mechanism React Native's own index
  facade already used. Names come from the transform's own output, read from its AST,
  rather than from requiring the module: the ESM hook runs on the module-loader thread,
  where the CommonJS hooks that compile JSX are not installed, so requiring there fails
  outright. A module whose shape is not statically knowable (`module.exports =
someValue`) emits no hint and keeps Node's own detection, which is no worse than
  before.

  The package budget is re-baselined to ~5% above the measured artifact, which is what
  its own policy asks for, rather than left to fail on the next change.

- c1c973d: Gate that every declared entry point actually loads

  The published `exports` map declares eleven subpaths, and a test checked that each
  one points at a file that exists. Existing is not loading: three of the declared
  CommonJS entries throw the moment they are required, and nothing noticed because
  nothing ever loaded them.

  `./dist/index.cjs` — the package's `main`, and the `require` condition of the root
  export — is one of them. The root entry re-exports the presets, every preset imports
  `vi` from vitest at module scope, and vitest refuses to be required from CommonJS. So
  `const { reactNative } = require("vitest-native")` fails, while the ESM entry the
  plugin is normally loaded through works. `./dist/presets.cjs` and `./dist/setup.cjs`
  fail for the same reason.

  Each declared runtime entry is now imported (or required, by extension) during the
  suite. The three that cannot load are listed explicitly with the reason, and one that
  starts loading fails as a stale entry, so the list cannot outlive the problem it
  describes. Every `vi` call sits inside a preset factory that only runs in a worker, so
  moving the import is a fix to how the presets are written rather than to the export
  map; it is not part of this change.

- 3189ff9: Thrown errors now carry a class and a stable code

  Errors raised by the plugin were plain `Error` instances whose only identity was their
  message text. They are now `VitestNativeError`, or `VitestNativeTypeError` where a
  `TypeError` is the right shape, each carrying a `code` from a fixed set.

  What this changes for a consumer is the `name` on the error: it reads
  `VitestNativeError` rather than `Error`, and that survives Vitest's serialisation of
  errors out of a worker, which keeps `name`, `message` and `stack`. The `code` is
  readable on errors thrown in the Vite main process — configuration and resolution
  failures — but is an own property, so it does not survive that same serialisation for
  errors raised inside a worker.

  The classes and an `isVitestNativeError` guard are not importable from the package:
  there is no `vitest-native/errors` entry point, and the main entry does not re-export
  them. Adding one is a separate decision, since it is a twelfth public export path to
  support, and it would also let the bundled entries self-reference `errors.mjs` instead
  of carrying a second copy of it.

- a70c9f2: Flow enums are no longer dropped by the native engine's transform

  React Native's Babel preset carries both `@babel/plugin-transform-flow-strip-types` and
  `babel-plugin-transform-flow-enums`, but in separate `overrides` entries that Babel
  merges into a single pass with strip-types first. It therefore deleted `export enum
Foo {}` as if it were a type annotation, while leaving the code that referenced `Foo`
  in place — a module that loaded cleanly and threw `ReferenceError` on a path nothing
  had warned about. In React Native 0.86 this made `VirtualViewMode` and
  `VirtualViewRenderState` undefined when imported from `react-native`.

  The enum plugin now runs ahead of the preset, which Babel's plugin/preset ordering
  guarantees. Measured identical on preset 0.85.3 and 0.86.1, so this is the preset's
  ordering rather than a version mismatch.

  The precompiled registry's cache key now includes the transform's version too. It
  stores transformed module source, and neither the preset version, the Babel version nor
  the package version changes when the transform's own configuration does — so a warm
  registry would have kept serving modules built before this fix.

- a70c9f2: Remove the hot runtime's last dependency on Vitest's internal worker state

  The hot runtime re-enabled Vitest's per-file isolation by mutating
  `state.ctx.config.isolate` inside the worker — a shape nothing contracts. It now
  performs the two operations that flag was buying (`mocker.reset()` and a clear of the
  evaluated module graph) directly, through public API: the `onModuleRunner` hook of
  `vitest/worker`'s `init()`, and Vite's `ModuleRunner.clearCache()`.

- a70c9f2: Complete the `jest` global's API surface

  Eleven documented Jest members were absent from the `jest` global, so a migrated suite
  calling one got `TypeError: jest.X is not a function` — the bare failure the shim's
  signposting already existed to prevent. The gaps included siblings of members that
  were covered: `isolateModules` was signposted but not `isolateModulesAsync`,
  `deepUnmock` but not `dontMock`.

  Three had a Vitest equivalent under a different name and now use it:

  - `jest.dontMock(m)` → `vi.doUnmock(m)`
  - `jest.setMock(m, exports)` → `vi.doMock(m, () => exports)`
  - `jest.now()` → the current clock, faked or real

  The rest throw an error naming the API and its closest migration, as the other
  unsupported members already did: `isolateModulesAsync`, `unstable_mockModule`,
  `replaceProperty`, and the automock family (`enableAutomock`, `disableAutomock`,
  `autoMockOff`, `autoMockOn`, `onGenerateMock`), which has no Vitest counterpart at all.

- e6cb458: `jest.mock` with an async factory keeps its named exports

  `jestMockTransform()` wraps each `jest.mock` factory so its return passes through
  Jest's CommonJS interop. The wrapper handled a synchronous return only. An async
  factory — or any factory returning a promise — handed the promise itself to the
  interop, where it matched the object branch: a promise has no own enumerable keys and
  no `default`, so the result was `{ default: Promise }`. Every named export
  disappeared, and the failure surfaced as

      No "readSetting" export is defined on the "./settings-store" mock.
      Did you forget to return it from "vi.mock"?

  naming a `vi.mock` the author never wrote.

  Interop now applies to the resolved module. The check is by object tag rather than for
  a `then` method: a module may legitimately export a function named `then`, and
  awaiting that calls it with `(resolve, reject)` and never settles, hanging the test
  file instead of failing it. `async` functions and `Promise.resolve` only ever produce
  native promises, which the tag identifies across realms.

- a70c9f2: `jest.setTimeout(ms)` now applies instead of being ignored

  The jest-compat shim stubbed `jest.setTimeout` as a no-op, on the grounds that `vi`
  had no equivalent. `vi.setConfig({ testTimeout })` is one, and it applies for the rest
  of the file — the same scope Jest gives `jest.setTimeout`, since Vitest resets the
  config after each test file.

  The no-op did not crash anything, which is what made it costly. A suite opening with
  `jest.setTimeout(30000)`, routine for slower React Native suites, silently kept
  Vitest's 5s default: its slow tests failed on time while the line meant to prevent
  that sat above them. A 6s test under `jest.setTimeout(20000)` failed with "Test timed
  out in 5000ms" before this change and passes after it.

  A non-numeric argument is still ignored rather than written into the config.

- a70c9f2: Add `LayoutAnimation.easeInEaseOut()`, `.linear()`, `.spring()`, `.setEnabled()` and `.checkConfig()` to the mock engine

  The preset shortcuts were missing entirely, so `LayoutAnimation.easeInEaseOut()` — the
  idiomatic one-liner in a React Native codebase — threw "is not a function" under the
  mock engine while the same call worked under the native one. They now bind to
  `configureNext` with the matching preset, exactly as React Native defines them, so a
  test asserting on `configureNext` sees the call either way.

  Found by diffing the mock's member list against real React Native's across every mocked
  namespace. A behavioural test cannot catch a member that is not there, so the
  cross-check corpus now covers this shape too.

- a70c9f2: Stop claiming a preset covers the legacy `react-native-vector-icons` package

  The preset auto-detect map listed both `@react-native-vector-icons/common` and the
  unscoped `react-native-vector-icons` against the `vectorIcons` preset. That preset
  shadows exactly one module — the shared factory the v10+ scoped icon-set packages
  are built on. The legacy package predates that split and does not use it, so the
  preset had nothing to give it.

  A package name in that map means "a preset shadows this, so its real source never
  loads", and three things act on it: the package is excluded from React Native
  ecosystem auto-inlining, and both `doctor` and `migrate` report it as already
  handled. A project on the legacy package therefore had its untranspiled source
  neither shadowed nor transformed, which is the parse failure auto-inlining exists to
  prevent, while the tooling reported it as covered.

  The mapping is removed, so `react-native-vector-icons` is auto-inlined and
  transformed like any other React Native ecosystem package. Projects on the scoped
  packages are unaffected.

  Presets are also now checked against the map: every package name it lists must be
  one the named preset actually declares a module for. Only packages installed in this
  repository's own test suites exercised that link before, so a mapping that pointed
  nowhere could go unnoticed.

- 1c4c7f7: Update `magic-string` to 1.x

  `magic-string` is one of the package's two runtime dependencies, so the major bump
  changes what consumers install. The four methods the `jest.mock` hoisting transform
  uses — `overwrite`, `appendLeft`, `appendRight`, and `generateMap` — are unchanged in
  behaviour, and the hoisting suite passes against the new version.

- c1c973d: Resolve `.json` imports, and try extensions in Metro's order

  The plugin replaces Vite's `resolve.extensions` wholesale with a platform-ordered
  list, so anything missing from that list stops resolving. `json` was missing, while
  Metro treats it as a source extension — `import config from './config'` next to a
  `config.json` worked in the app and failed in the test, with a bare "Cannot find
  module".

  The order within each platform group was also inverted relative to Metro. Metro's
  default `sourceExts` are `["js", "jsx", "json", "ts", "tsx"]`, so it picks `Foo.js`
  over `Foo.tsx`; the plugin picked `Foo.tsx`. A project with a compiled file beside
  its source therefore tested a different file than it shipped. Both graphs now try
  `.<platform>.{js,jsx,json,ts,tsx}`, then `.native.*`, then the bare extensions, which
  is Metro's own order.

  `.mjs` and `.cjs` remain unresolvable without an explicit extension, matching Metro.

  The list was written out twice — once for the Vite graph and once for the Node
  graph — with nothing holding the two together; a divergence would have resolved one
  file in one graph and a different file in the other for the same import. Both are
  now derived from a single definition, and a test asserts they agree.

- a70c9f2: `migrate` no longer emits Jest's `<rootDir>` token into the config it generates

  A Jest `setupFiles` or `setupFilesAfterEnv` entry written as `<rootDir>/jest.setup.js`
  — the form nearly every real Jest config uses — was copied into the generated Vitest
  config verbatim. Vitest does not substitute `<rootDir>`, so it resolved the string as
  written and every test file failed to load with
  `Cannot find module .../<rootDir>/jest.setup.js`, while the migration report listed
  the mapping under "Mapped automatically".

  Setup-file paths are now rewritten the same way `moduleNameMapper` targets already
  were, as `fileURLToPath(new URL('./jest.setup.js', import.meta.url))`. `testMatch`,
  `include` and `moduleNameMapper` already stripped the token; setup files were the one
  path that did not.

- 599d0e0: Give React Native ecosystem packages a single owner

  The native engine runs two module systems: Vite resolves the test graph, and Node's
  CJS resolver serves everything externalized. Auto-detected ecosystem packages were
  inlined, so Vite executed them — which left Node either unable to load them at all,
  or holding a second copy with its own module-level state.

  The second case is the dangerous one. Nothing fails: a store configured through one
  copy simply reads back unset through the other, so a translated label renders as an
  empty string and the test compares empty output against expected text with nothing
  pointing at the cause.

  They are now externalized and transformed by the Node hooks, exactly as React Native
  itself already is, so one graph owns them and a single instance follows from the
  design rather than from Vitest's externalization heuristics.

  Both properties inlining provided are kept, and were measured rather than assumed:
  `vi.mock()` still intercepts these packages, and their module state still resets
  between test files. Node can now also load them at all — previously a `require` of
  an ecosystem package failed on its untranspiled source, since the hooks transformed
  only React Native and the packages named in `transform`.

  This also fixes a reported failure that looked unrelated: a Flow type import inside a
  PLATFORM VARIANT of an auto-detected package — `datetimepicker.ios.js` — failed to
  compile until the project named the package in `transform` by hand. The detector had
  not missed it; the package declares react-native in peerDependencies and was found.
  The variant was simply reached through Node, which had no way to strip Flow from a
  package Vite owned. One owner fixes both halves: the resolver picks the variant and
  the same hooks that transform React Native strip its types.

- 4be3eab: Switch a single auto-detected preset off with `presets: { name: false }`

  `presets` accepted only an array, and providing one replaced auto-detection entirely.
  A project that needed to drop one preset — for example the navigation preset, because
  its stub means a real `NavigationContainer` never fires `onReady` — had to enumerate
  every other detected preset by hand. That list then rots silently as dependencies
  change: add a library and its preset is not applied, because the hand-written array
  does not mention it.

  Passing an object keeps auto-detection and names only what to drop. The array form is
  unchanged.

- b015c89: Rebuild the React Native registry when React changes

  Upgrading React while staying on the same React Native served a precompiled registry
  built against the previous React. The native engine then failed in ways that look
  nothing like a stale cache:

  ```
  TypeError: Cannot read properties of null (reading 'useContext')
  AssertionError: expected [Function Dimensions] to be [Function Dimensions]
  ```

  — a null React dispatcher and React Native singletons that no longer compare equal,
  which is the duplicate-instance failure the registry exists to prevent.

  The registry is disk-cached under `node_modules/.cache/vitest-native` and keyed on
  React Native, `@babel/core`, `@react-native/babel-preset`, the platform, and this
  package's own version. `react` was missing, and the manifest check could not stand in
  for it: that stats React Native's own files, which do not change when React alone is
  upgraded. The cache was therefore reused when it should not have been, and deleting
  the cache directory by hand was the only way out.

  `react` is now part of the key. Because the failure is self-clearing on a later run,
  it was easy to read as flakiness rather than as a stale cache.

- 9428119: Report when the precompiled React Native registry cannot be built

  The native engine compiles React Native's module graph into a single file, and falls
  back to per-file module loading when it cannot. The fallback is correct — tests still
  run and no result changes — which is what made it hard to notice: a degraded run
  looked exactly like a healthy one, only slower. Measured on this package's own native
  suite, roughly 1.4x, and the per-file cost compounds on a larger suite.

  Neither failure path said so. The build path logged only under `diagnostics`, which
  is off by default, and the cache-directory path returned without a message under any
  setting. Both now warn once per distinct cause, naming the cause and stating that
  results are unaffected. Setting `VITEST_NATIVE_NO_REGISTRY=1` remains silent, since
  that path is a request rather than a failure.

- 44432f0: `jest.requireActual` resolves relative paths against the calling file

  Jest resolves `jest.requireActual('../thing')` against the module that called it. The
  compat layer backed it with a single `createRequire` anchored at the project root, so
  bare specifiers worked and relative ones escaped the source tree: MODULE_NOT_FOUND,
  with a requireStack pointing at `<projectRoot>/package.json` — a confusing place to
  be sent when the file sits beside the test. A migration reported this breaking five
  files until they shimmed around it.

  Relative specifiers now resolve from the caller, taken from the stack, since these
  are runtime calls on the `jest` global rather than rewritten imports. Bare specifiers
  still resolve from the project, and a caller-relative miss is reported rather than
  retried against the root, which could otherwise resolve an unrelated file that
  happens to sit at the same relative path.

- a70c9f2: `resetAllMocks()` now resets every stateful mock, including `NativeAppEventEmitter`

  The helper reset a hand-written list of seven mocks. `NativeAppEventEmitter` is a
  second event-emitter instance — the mock registry builds one per name, so it is not
  the same object as `DeviceEventEmitter` — and it was not on the list. A listener
  registered on it survived `resetAllMocks()` and fired again in the next test.

  The helper now resets every mock that exposes a `_reset`, so a stateful mock added
  later is covered on arrival rather than needing to be remembered here.

- 69c761b: Report when a package resolves to two different files across the two module systems

  The native engine runs two resolvers: Vite resolves the test graph, and Node's CJS
  resolver serves everything externalized. The plugin points Vite at React Native's
  fields — `react-native`, `module`, `jsnext:main`, `jsnext` — and `main`, which is all
  Node's resolver consults, is not among them.

  Any package publishing a `react-native` field, which is ordinary across the ecosystem,
  or a `module` field, which is ordinary for anything dual-format, therefore resolves to
  a different file on each side. When both graphs load it the package exists twice, with
  separate module-level state, and nothing says so: a store written through one copy
  reads back unset through the other, so values arrive empty and the failure surfaces far
  from its cause.

  The Node-side resolver now compares each package it resolves against the file Vite's
  field order would choose, and reports the pair once per package when they differ,
  naming the field responsible and what diverging state means. It does not fire on a
  suite where the two agree.

  This is a diagnostic, not a fix: making the two resolvers agree is a separate change.

- 599d0e0: Resolve format-only package fields the way Node does, so they load once

  The native engine runs two module systems. Vitest forwards `resolve.conditions` to
  the worker's Node, so packages using an `exports` map resolve identically on both
  sides. Legacy top-level fields have no such bridge: Vite reads `module`, Node reads
  `main`, and a package publishing both is loaded twice with separate module-level
  state. Nothing fails — a store written through one copy reads back unset through the
  other, so values arrive empty and the failure surfaces far from its cause.

  A `module` field selects a different FORMAT of the same code, so Vite is now pointed
  at `main` for those packages and the pair collapses into a single instance.

  A `react-native` field is left exactly as it was. That one selects a different
  IMPLEMENTATION — the native build rather than the web build — and Metro resolves it
  ahead of `main`, so the engine must too. Aligning it downward would quietly load the
  web build, which is a fidelity regression rather than a fix; packages using it stay
  split and are reported by the duplicate-instance warning instead.

  Packages the engine inlines and transforms are also untouched, since Vite is meant to
  own their source.

- 3a0dc69: Cover the native-stack surface in the screens preset

  A real native-stack never reached `onReady`, so the screen stayed empty with nothing
  thrown, until the project shipped its own mock of react-native-screens. The preset
  declared 12 exports where the package has 26.

  The gap was closed against react-native-screens 4.26.2's published type surface
  rather than against the names that had been noticed missing — the report named six,
  and checking the package found sixteen. `ScreenStackItem` is the one that matters
  most, since native-stack renders through it.

  `ScreenContext` is a real React context rather than a component stub, because
  native-stack calls `useContext` on it, and `useTransitionProgress` returns a progress
  shape rather than an empty mock. The v3 names `NativeScreen` and
  `NativeScreenContainer` are kept so a project on the older major does not lose them.

  Not covered: `RNSScreensRefContext` and `GHContext`, which are not entry-point
  exports — they live in the package's `contexts` module and are reached by deep
  import.

- a70c9f2: The snapshot serializer no longer throws on a circular prop, and produces stable output

  Three fixes to the serializer registered for every project by the plugin's setup file.

  A prop holding a circular object — a navigation object, a store, anything with a
  parent back-reference — raised `TypeError: Converting circular structure to JSON`, so
  the test failed with a type error instead of producing a snapshot. Cycles now print
  as `[Circular]`.

  Object keys inside a prop value are sorted, so two structurally equal props serialize
  identically. Previously `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produced different
  snapshots, and a rewrite that changed nothing could churn a snapshot file. Prop names
  were already sorted; this applies the same rule inside values. Array order is
  preserved, since it is meaningful.

  Functions and `undefined` nested inside a prop are shown rather than dropped:
  `{ onPress: fn }` used to print as `{}`, an empty object that reads like missing data.

  Non-element children are also indented one level less, matching sibling elements.

- 687b79f: Document the versioning contract, and check it against the build

  The package shipped stability _labels_ — which surfaces are release-supported, which
  are experimental — but never a semver contract: which exports and options are covered,
  what a major may break, how the peer ranges may move, and what a deprecation cycle
  looks like. `docs/versioning.md` states all of it, and ships with the package.

  The document enumerates the public surface, so it is checked rather than trusted.
  `tests/versioning-contract.test.ts` loads each documented entry point and asserts the
  export lists match exactly in both directions, that the stated preset-factory count is
  right, and that the documented plugin options are exactly the keys the validator
  accepts. A surface added without a contract update fails the suite, as does a contract
  naming something that does not exist.

- 4285a77: Auto-detection sees workspace members, so running from a monorepo root works

  Package auto-detection walked manifests upwards from the run root. In a workspace the
  run root is frequently _above_ the package under test — Nx invokes tasks from the
  workspace root, and Vitest's root follows the working directory — so the app's own
  dependencies live in a manifest that walking up never reaches.

  A workspace library therefore missed detection, stayed in Vite's graph while Node
  loaded it too, and came apart into two module instances with separate module-level
  state. Reproduced in a pnpm workspace: the same config and the same code passed from
  the app directory and failed from the workspace root, with state written through one
  graph reading back unset through the other.

  Detection now also reads the manifests of workspace members declared by any manifest
  it finds, including pnpm's separate `pnpm-workspace.yaml` list, and resolves each
  candidate from whichever of those directories can see it — necessary under pnpm,
  where a workspace package is linked only into the package that depends on it.

  The consumer gate now runs the monorepo fixture from the workspace root as well as
  from the app directory, so the invocation that exposed this is covered rather than
  assumed.

## 0.9.0

### Minor Changes

- 3b08c19: Actionable errors and engine transparency for migration failure points.

  - **Untransformed-package explainer**: when an externalized `node_modules` file throws a SyntaxError that fingerprints as untranspiled JSX/Flow/TypeScript (`Unexpected token '<'` and friends), the error now names the owning package and states the fix — `reactNative({ transform: ['<pkg>'] })` — with a link to the migration guide, instead of a bare Node compile stack. This is the single most common migration blocker observed in real-app bake-offs.
  - **Decorated Babel failures**: a Babel crash inside the native transform now reports the file, platform, and owning package at the single transform choke point (ESM loader, CJS require hook, and `requireActual` all inherit it), chaining the original error as `cause`.
  - **Engine banner**: one log line per process states which engine actually ran (`engine: native — real react-native@X` / `engine: mock — …`), so a silent `auto` fallback can never masquerade as real-RN testing.
  - **Config-time fail-fast**: explicit `engine: 'native'` without `@react-native/babel-preset` / `@babel/core` now fails at config time with install instructions, instead of starting the run and dying inside the loader. The `auto`→mock fallback notice is now emitted via `console.warn`, and the Flow-strip parse-failure warning is always visible (no longer diagnostics-gated).
  - **jest-compat signposts**: `jest.isolateModules`, `jest.createMockFromModule`, `jest.genMockFromModule`, and `jest.deepUnmock` now throw errors that name the API and its closest Vitest migration instead of bare `is not a function` TypeErrors; `jest.retryTimes` warns once and continues instead of crashing the suite.

- a6a6ae3: The mock engine's Animated is now a live node graph, matching real React Native's semantics (previously it was a snapshot system — the largest known fidelity gap, and the class real-app bake-offs had to monkeypatch around).

  - **Derived nodes are live.** `interpolate()` (numeric AND string), `add`/`subtract`/`multiply`/`divide`/`modulo`, and `diffClamp` recompute from their sources on every read and re-notify listeners when any source moves. Numeric interpolations chain; derived nodes are valid operands (previously coerced to 0); chaining off a string interpolation still throws like RN.
  - **Animated components re-render.** `Animated.View`/`Text`/`Image`/`ScrollView`/`FlatList`/`SectionList` and `createAnimatedComponent` wrappers subscribe to every node in their style — a `setValue()` or `timing().start()` after render updates the rendered style, so `toHaveStyle` assertions see current values. Gated against real React Native by three new crosscheck probes (post-render `setValue`, live interpolation, live transform) — the corpus is now 78/78.
  - **Offsets are real.** `setOffset`/`flattenOffset`/`extractOffset` implement RN's semantics (the canonical PanResponder drag pattern) on `Value` and `ValueXY`; `ValueXY.addListener` now reports the joint `{x, y}` value.
  - **`__getValue()` exists on plain values** (RN's own tests call it), and `AnimatedValueXY`/`AnimatedColor` gained `__getValue`/`getValue` parity.
  - **`useAnimatedValue`/`useAnimatedValueXY`/`useAnimatedColor` are real hooks**: the value is `useRef`-memoized and survives re-renders (previously every render minted a fresh node, silently resetting animation state — and rebuilt the entire Animated namespace to do it). Consequently they must now be called inside a component, exactly like on-device.

- ac70dec: Compile React Native packages from `node_modules` automatically

  Most of the React Native ecosystem publishes untranspiled source — JSX, Flow, or
  TypeScript — assuming Metro will compile it. Node cannot run that, so every project
  had to discover its own allowlist one `SyntaxError: Unexpected token '<'` at a time
  and maintain it by hand in `transform: [...]`.

  `engine: 'native'` now detects those packages: any dependency declaring `react-native`
  in **its own** manifest is compiled with the project's React Native Babel preset and
  inlined into the test graph. The manifest is the authority rather than a name pattern —
  `react-native-*` misses `@gorhom/bottom-sheet` and would wrongly claim `react-native`
  itself.

  Because those packages land in the graph Vitest owns rather than being externalized,
  `vi.mock('the-package')` now reaches them too. Mocking `react-native` itself still does
  not change what a library sees — its own imports compile to `require`, which reaches
  React Native directly.

  Dependencies are read from the project's manifest and every manifest above it, so a
  workspace that declares its React Native libraries at the repository root is covered.

  Excluded automatically: packages a preset already shadows (their real source never
  loads) and the test infrastructure — `@testing-library/react-native` and the renderers,
  where a second copy in the graph corrupts rendering. `transform: [...]` keeps its
  existing meaning for anything detection misses, and takes precedence over it.

- bbbfc5d: Stub Expo's dev-server messageSocket under the native engine.

  `expo`'s `Expo.fx` requires `async-require/messageSocket` whenever `__DEV__ && globalThis.expo`, and that module throws at load time when the bundle wasn't served over HTTP ("Cannot create devtools websocket connections in embedded environments"). Under the native engine this took down any suite importing an `expo-*` package (e.g. `expo-image`) — the primary blocker for Expo apps. The module's only job is a devtools websocket to a live dev server, an environment that doesn't exist under Node, so it is now stubbed to a no-op via the boundary mechanism — matching Jest's dev-server-layer mocks. All published variants are covered (`build/` output and `src/` TS sources, plain and `.native`), and the `.ts`/`.tsx` require handlers now consult boundary stubs, which previously only `.js` did.

  Validated against the obytes Expo template bake-off: the login-form suite (previously import-time dead) now passes, 34/40 → 38/40 overall with the two remaining failures pre-existing and unrelated (bottom-sheet mock completeness).

- 1a3bcea: New CLI: `npx vitest-native init | doctor | migrate`.

  - **`init`** writes a ready-to-run Vitest config (`--jest-compat` for the exact jest-compat block the migration guide documents; refuses to overwrite without `--force`).
  - **`doctor`** diagnoses the environment read-only: Node floor (including the RNTL 14 ⇄ Node 22.13 interaction, which previously surfaced only as a raw runtime failure), required peers against supported ranges, which engine `auto` resolves to and why, every auto-detected preset, Expo presence with known-limits pointer, and config presence. Exits non-zero on blocking problems.
  - **`migrate`** analyzes the project's Jest configuration (`package.json#jest` or `jest.config.{js,cjs,json}`) and reports key-by-key what maps automatically (setup files, path aliases, `transformIgnorePatterns` allowlists → `transform: [...]`, timeouts, mock hygiene flags), what the auto-detected presets already cover (deletable manual `__mocks__` and setup lines), what needs a human, and what drops — ending with a complete suggested config. Dry-run by default; `--write` saves it. Test files are never edited (`jestMockTransform()` handles top-level `jest.mock` at runtime).

  The packed-tarball consumer suite exercises the bin end-to-end (`npx vitest-native doctor|migrate`).

- ac70dec: Precompile React Native's require graph so isolated test files stop paying to re-load it

  The native engine runs React Native's real JavaScript, and with isolation on — the
  default — that graph was re-instantiated for every test file: roughly 440 separate
  Node module loads each time, one per RN source file. Measured on RN 0.86, that cost
  ~59ms for a typical test's slice of React Native and ~110ms for the full public API,
  per file.

  React Native's graph is now walked once per (RN version × platform × Babel
  toolchain) and emitted as a single file of lazy per-module factories with every
  require target resolved ahead of time. A test file pays one read and one compile
  instead of ~440. The registry is built in the Vite process, so the cost is paid once
  per run, and it is cached under `node_modules/.cache/vitest-native` keyed by a
  manifest of the files it was built from — a reinstalled or patched React Native
  rebuilds it rather than serving stale code.

  Measured on this repository's native suite: aggregate import time 8.8s → 1.9s
  (4.6×), wall clock 1.81s → 1.05s.

  Semantics are unchanged by design. Module identity is preserved, so React Native's
  singletons behave exactly as before and a deep `react-native/Libraries/...` require
  from an ecosystem package resolves to the same instance the app sees. Laziness is
  preserved, so a test that touches `View` and `StyleSheet` still does not execute the
  rest of React Native. Anything the registry cannot serve — a computed require, a
  module outside the entry graph, a package listed in `transform` — falls through to
  the per-file loader hooks, and a registry that cannot be built leaves the engine
  running exactly as it did before.

- ac70dec: `vi.mock('react-native')` now works under the native engine

  React Native runs in Node's module graph under `engine: 'native'`, which put it
  outside Vitest's module registry — so `vi.mock('react-native', …)`, the single most
  common thing an existing Jest suite does, silently had no effect. It was the most
  frequently hit blocker when moving a real suite over.

  The app and test graph now import React Native through a facade module the plugin
  serves. The facade re-exports the same instances Node's graph holds, so React
  Native's behaviour and object identity are unchanged — an externalized library and
  your test still see the very same `Dimensions`, `Platform`, and `StyleSheet`. What
  changes is that Vitest owns the module id, which is what lets it intercept:

  ```ts
  vi.mock("react-native", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react-native")>()),
    Alert: { alert: vi.fn() },
  }));
  ```

  `importOriginal()` returns real React Native, everything left unmocked stays real,
  and components still render React Native's own host components (`RCTView`, not a
  stand-in).

  One limit worth knowing: the interception covers modules in your project's graph —
  your app and test code. A third-party package that Vitest externalizes resolves
  React Native through Node and will still see the unmocked module. Add such a package
  to `transform: [...]` if its view of React Native needs to be mocked too.

- ac70dec: Support Vitest 5

  The peer range widens from `>=4 <5` to `>=4 <6`. Nothing in the package needed to
  change for it: the native engine, the mock engine, the precompiled React Native
  registry, the `react-native` facade, and the hot runtime all run unmodified on Vitest
  5, including its `@experimental` worker API.

  The claim is backed the same way the Vitest 4 support is. The CI matrix gains a
  Vitest 5 column — run against the oldest and newest supported React Native, since it
  varies the runner rather than RN — and it is blocking, because a declared peer range
  is a promise about every release inside it. Each cell runs the native suite stock and
  hot plus the mock-vs-real-RN cross-check, exactly as the Vitest 4 columns do.

  While 5.x is still prerelease it is reachable only through its `beta` tag; the
  repository's install-age policy still applies, so CI resolves the newest beta at least
  a week old rather than whatever published that day.

- 2d07b7a: Add a built-in `react-native-worklets` preset (auto-detected). Worklets is Reanimated's low-level runtime and is also imported directly by apps (e.g. `import { scheduleOnUI } from 'react-native-worklets'`). It ships a Jest mock at `react-native-worklets/lib/module/mock` that is ESM ending in `module.exports = …`; under the native engine React Native and its ecosystem are externalized, so requiring that file through Node throws `module is not defined in ES module scope` and takes down the whole test file. The preset shadows the package with a self-contained mock modelled on worklets' own `mock.js` API (schedulers run their worklet synchronously, matching the Reanimated preset), so worklets-using suites load and render without a hand-written mock.

### Patch Changes

- e49168e: Bound hot-runtime memory by default. When `hotRuntime` is enabled on the native engine and neither `memoryLimit` nor `recycleAfterFiles` is configured, a default per-worker memory ceiling of `clamp(totalmem * 0.25, 768MB, 1.5GB)` is now applied. Hot workers keep React Native resident and accumulate roughly 4 MB per file, so without a bound a long suite could grow toward OOM; the default lets multi-worker runs recycle a worker once it crosses the ceiling, keeping total memory bounded out of the box.

  An explicit `memoryLimit` or `recycleAfterFiles` is respected unchanged. Single-worker hot still cannot recycle (Vitest batches all files into one scheduler task), so the bound is inert there and the existing one-time "recycling INACTIVE" warning advises running with `maxWorkers >= 2`.

- 0d38401: Fix two `mock` engine divergences from real React Native, found by the behavioral cross-check:

  - `Pressable` now resolves function `style` and `children` (`({ pressed }) => …`) against its press state, matching real RN's resting render and updating while pressed. Previously the functions were passed through untouched, so the style was never applied and function children never rendered.
  - `processColor()` returns `undefined` for an unparseable color (matching real RN's normalizer) instead of coercing to opaque black.

  Also publishes the cross-check as a generated, drift-guarded fidelity report — a live badge and a docs page listing the full corpus and what is deliberately left ungated — and expands the corpus to 75 probes.

- 6c29566: Expand the "Migrating from Jest" guide with the empirically-derived limits of a real migration: a "Known limits" section covering assertions coupled to Jest's RN mock internals that don't port under a real-RN engine (`jest.spyOn(View.prototype, …)`, mocks of RN internal submodules, raw `source`-shape assertions, `jest.mock` nested in callbacks), an Expo-core caveat, and concrete guidance for the `transformIgnorePatterns` → `transform` allowlist (including the JSX-in-`.js` third-party-lib parse error and its fix).
- ac70dec: Narrow the mock engine's Flow-strip, and stop `migrate` opting packages out of auto-compilation

  **Flow-strip targeting.** The mock engine compiles React Native ecosystem packages
  pulled into the Vite graph, selected by testing for `react-native` anywhere in the
  file's path. That also matched every dependency of a project in a directory called
  `react-native-app`, and packages like `eslint-plugin-react-native` — running a Flow
  parser over files with nothing to do with React Native. It now matches the package
  name after `node_modules`: a name beginning with `react-native` (scoped or not, so
  `@shopify/react-native-skia` counts) or a scope beginning with `@react-native`.
  Everything the substring test legitimately caught is still caught, and nothing else
  is.

  **`npx vitest-native migrate`.** It translated Jest's `transformIgnorePatterns` into
  `transform: [...]` entries for packages the engine now detects and compiles by itself.
  That was worse than redundant: an explicit `transform` entry takes precedence, so the
  suggested config would have opted those packages back out of inlining, losing
  `vi.mock` support for no gain. Packages declaring `react-native` are now reported as
  already handled.

  Also adds a test that the plugin's virtual `react-native` module exports exactly what
  the mock provides — the two lists were in step, but only by hand.

- f6c4c5b: Provide `SourceCode.getConstants().scriptURL` at the native boundary. RN's `getDevServer` (`Libraries/Core/Devtools/getDevServer.js`) reads `scriptURL` and calls `.match()` on it; under the native engine the value was `undefined`, so `getDevServer` threw and took down any test whose module graph reached it. The boundary now returns a `file://` (bundled) URL for the `SourceCode` native module. It is deliberately not an `http(s)` URL: `getDevServer` only treats `http(s)` script URLs as a live dev server, so a `file://` value keeps `bundleLoadedFromServer` false — tests run as if loaded from a bundle rather than a Metro dev server, which prevents RN internals and third-party SDKs from believing they're connected to a packager and attempting real network I/O against `localhost:8081`. This mirrors the intent of RN's own Jest mock (which keeps that flag off).
- ac70dec: Explain why `engine: 'native'` cannot run on a VM pool

  Now that a configured `pool` is respected rather than overridden, `vmThreads` and
  `vmForks` reach the native engine — where they cannot work. VM pools execute test code
  in a `vm` context whose module executor bypasses Node's loader, and `module.register()`
  (how the engine installs the ESM hook that Flow-strips React Native and resolves its
  platform files) throws there outright. The failure surfaced far from its cause, as
  `Platform.OS` being undefined deep inside `NativeEventEmitter`.

  The plugin now refuses at config time and names the alternatives: `threads` (the
  default), `forks`, or `engine: 'mock'`, which needs no hooks.

- ac70dec: Stop overriding a configured `pool`, and refuse a mismatched Vitest instead of reporting nothing

  Two fixes to the native engine's pool handling.

  **A configured `pool` is no longer discarded.** A plugin's `config()` result is merged
  over the user's config, and the native engine returned `pool: 'threads'`
  unconditionally — so a project asking for `forks`, `vmThreads`, or its own custom pool
  silently got `threads`, with no warning and no way to tell from the outside. `threads`
  is now only a default, applied when no pool was configured. (`hotRuntime` still
  supplies its own pool, since opting into it _is_ choosing one, and now warns when that
  overrides a configured pool.)

  **`hotRuntime` now fails loudly when its worker would load a different Vitest.** The
  hot worker entry ships inside vitest-native, so its `import 'vitest/worker'` resolves
  from this package's location rather than the project's. Where a monorepo has more than
  one Vitest install — a linked package, a hoisted `node_modules`, mixed versions across
  workspaces — the worker and the host end up on different installations. Nothing about
  that was visible: the start handshake succeeded, the run request was accepted, no
  result was ever reported, and Vitest printed "No test files found" with no error at
  all. The pool now compares the two resolved paths at config time and throws, naming
  both, rather than letting a run pass having tested nothing.

- ac70dec: Resolve React Native package entries the way Metro does

  Both engines set `resolve.conditions: ['react-native']`, which governs Vite's _client_
  environment. Vitest runs tests in the **ssr** environment, which keeps its own list —
  Vite drops both `conditions` and `mainFields` when deriving it — so neither was ever
  applied to anything a test imported.

  Any package shipping a distinct React Native build behind that condition therefore
  loaded its web build instead:

  ```jsonc
  "exports": { ".": { "react-native": "./native.js", "default": "./web.js" } }
  ```

  The same held for the legacy mechanism, still used by packages published before
  `exports`:

  ```jsonc
  "main": "./web.js", "react-native": "./native.js"
  ```

  Metro resolves both ahead of the standard fields, so tests were exercising code the
  app never runs, with nothing to indicate it. Both are now set for the ssr environment
  as well as the client one, under both engines, with a regression test each.

  `browser` is deliberately not added to `mainFields` even though Metro lists it: under
  Node it would pull the web build of any package that has a browser field and no
  react-native one.

  **Upgrade note.** The `react-native` field is honoured wherever it appears, not only
  on React Native libraries — Algolia's clients, `nanoid` and `msgpackr` all ship one,
  usually pointing at a browser or ESM build. Metro resolves those the same way, so this
  is the build the app actually runs, but a dependency may now load a different file
  than it did before. If that is a problem for one package, `transform: ['the-package']`
  or an explicit `resolve.alias` pins it.

- ac70dec: Fix a stale-registry hazard and restore React Native's stack frames

  Two defects in the precompiled registry, both found by reviewing it adversarially
  rather than by a failing test.

  **The cache key ignored the boundary mocks' content.** It hashed their module _names_,
  but the mocks are compiled into the registry, so changing one — a maintainer editing a
  mock, or a user upgrading to a release that changed one — left the cached registry
  valid and kept serving the previous behaviour with nothing to indicate it. The key now
  hashes the rendered mock source, and this package's own version alongside it, covering
  everything else it contributes.

  **Stack frames from inside React Native lost their file.** Collapsing ~440 modules
  into one file meant an RN-internal failure reported
  `registry/rn-ios-<hash>.cjs:253:7638` instead of
  `Libraries/Animated/nodes/AnimatedInterpolation.js` — the useful part of the frame.
  The registry now emits a source map attributing every generated line to the React
  Native file it came from, and enables Node's source-map support before compiling
  itself. Failure output names real React Native files again, at no runtime cost.

  Also relaxes the `hotRuntime` Vitest guard added alongside it: it compared resolved
  paths, so a monorepo with the same Vitest version installed in two trees was refused
  even though those interoperate fine. Only a version difference is an error now.

- 4c567c1: Make native-engine turboStubs identity-stable and spy-able. Unmocked native modules were served by a Proxy that minted a fresh stub object on every property access and whose get trap never consulted the target — so `NativeModules.Foo !== NativeModules.Foo`, and `vi.spyOn(NativeModules.Foo, 'method')` silently recorded nothing (the spy landed on a throwaway object). Stubs are now memoized per module name in the shared boundary state (`NativeModules.Foo === TurboModuleRegistry.get('Foo')`, matching bridgeless RN), methods are memoized on first read, and explicitly-set properties win — so spies record and restore correctly. A `has` trap reports all properties present, consistent with the get trap's serve-anything behavior, which `vi.spyOn`'s existence check requires. Under the hot runtime, per-file overrides (spies, memoized methods) are cleared between files via the surgical-reset registry while stub identity is preserved for resident libraries holding references.
- 57f155d: Fix three silent resolution-fidelity gaps around deep (subpath) imports.

  - **`react-native` subpath default exports are now the leaf module.** `import Platform from 'react-native/Libraries/Utilities/Platform'` previously received the entire mock object as `Platform`, so `Platform.OS` was silently `undefined`. The virtual subpath modules (ESM) and the CJS bridge now derive the intended export from the subpath's basename and serve it as the default — CJS requires get Babel-interop shape (`{ __esModule, default }` via a live wrapper) so both `require('.../Platform').OS` and `_interopRequireDefault(...)` consumers work. Unknown leaves keep the previous whole-mock fallback.
  - **`react-native/package.json` (and preset `pkg/package.json`) resolve to the real manifest.** Version gates like `require('react-native/package.json').version` previously read the mock and got `undefined`. Both the Vite-graph and CJS-bridge interception now exempt the manifest; when the package is not installed, the previous mock fallback is kept rather than erroring.
  - **Preset shadowing now covers subpath imports.** `import Swipeable from 'react-native-gesture-handler/Swipeable'` (and CJS equivalents, including requires nested inside externalized third-party libraries) previously bypassed the preset mock entirely and loaded the package's real native-runtime code — or failed resolution outright on package versions that no longer ship the deep file. All three redirect layers (Vite plugin, ESM loader hook, CJS require hook) now match subpaths of preset packages and serve the mock export named by the subpath's leaf, falling back to the root mock. JSON and asset-extension subpaths are exempt so manifests and font/image files keep resolving from disk. CJS interop wrappers are memoized per specifier (keyed by the live mock set, so hot-runtime per-file rebuilds stay correct) to keep module identity stable across repeated requires.

- 3b1c396: Native-engine transform cache rework: project-local, content-keyed, lazy Babel.

  - **The transform disk cache moves from `os.tmpdir()` to the project's `node_modules/.cache/vitest-native/`** (tmpdir fallback when node_modules is absent or unwritable). tmpdir is ephemeral on CI runners — every job paid a full cold Babel transform of React Native's ~250-file boot graph — and macOS purges it periodically. The new location persists across runs and is restorable by standard CI dependency-cache actions. The V8 compile cache is colocated.
  - **Disk entries are keyed by content hash (platform + path + source), not mtime + size.** Content keys survive fresh installs, Docker mtime normalization, and CI cache restores — and eliminate the stale-hit class where a same-size, same-mtime file with different content served wrong executable code. The path stays in the key because Babel's output embeds the filename (`_jsxFileName` in transformed JSX), so identical sources at different paths must not share an entry; restores are valid wherever the checkout path is stable, which CI workspaces are. The cache directory name now also carries the `@babel/core` version alongside the preset version, so a Babel upgrade invalidates cleanly.
  - **`@babel/core` loads lazily, only on a cache miss.** Loading Babel costs ~35ms vs ~0.5ms for the resolve-only version check, and under the default engine every isolated worker paid it even when every file came from the disk cache. Measured on the package's own native suite (warm cache): aggregate worker setup down ~30%, wall clock ~11% — the effect scales with test-file count.

- ac70dec: Match `transform: [...]` packages by their real location, not by name anywhere in the path

  The pattern behind `transform` tested for `/<package-name>/` anywhere in a file's
  path, so any **directory** sharing a package's name was treated as that package. A
  project folder called `expo`, or a source directory named after the library it
  implements, made every file beneath it get compiled and externalized as third-party
  source — including, in one case, this package's own runtime, which then failed with
  `Vitest cannot be imported in a CommonJS module using require()`.

  A file now matches only if it is inside the package's resolved directory, or under
  `node_modules/<name>/`. Both rules are needed: the resolved directory covers workspace
  and `file:` dependencies, which resolve to a real path with no `node_modules` segment,
  while the `node_modules` rule covers additional copies of a package that a single
  resolution cannot see.

- 091a572: Three hardening fixes:

  - **Prerelease peer versions no longer fail validation.** A prerelease sharing the minimum's major.minor (e.g. vitest `4.0.0-beta.3` against the `4.0.0` floor) parsed with `NaN` in the patch slot, failed the minimum check, and hard-errored at startup for installs running betas/RCs. Prerelease/build metadata is now stripped before comparison; a prerelease of the minimum itself is accepted.
  - **Mock-engine asset stubs match the native loader's semantics.** The extension match is now case-insensitive (`LOGO.PNG` stubs like `logo.png`), user-supplied `assetExts` entries are regex-escaped, and the stubbed basename is JSON-stringified so filenames containing quotes emit valid JS.
  - **The mock engine's Flow-strip transform skips unparseable files instead of throwing.** The `@flow` filter is a heuristic — the marker can appear inside a string or comment of a file `flow-remove-types` then fails to parse; that parse error previously took down the whole transform pipeline.

- ac70dec: Fix `importOriginal()` inside a test's own `vi.mock('react-native')` under the mock engine

  A test that registered its own `vi.mock('react-native', …)` replaced the registration
  the setup file makes, and the factory's `importOriginal()` then resolved to an empty
  module. The near-universal spread-and-override form therefore dropped every export
  the test did not name:

  ```ts
  vi.mock("react-native", async (importOriginal) => ({
    ...(await importOriginal()), // was empty
    Alert: { alert: vi.fn() },
  }));
  // -> No "Platform" export is defined on the "react-native" mock
  ```

  The virtual `react-native` module now re-exports the runtime mock, so
  `importOriginal()` returns the full surface and unnamed exports survive.

- ac70dec: Stop the hot runtime's legacy-runner import from breaking on Vitest 5

  `hotRuntime`'s test runner imported `vitest/runners` as a fallback for Vitest 4.0.x,
  guarded by a runtime check. The guard does not help: a literal specifier is resolved
  when the module is transformed, not when the branch runs. Vitest 5 removed that
  subpath, so the resolve failed on every test file — and the failure mode was the worst
  kind, reporting unhandled errors, running no tests, and still exiting 0.

  The fallback specifier is now computed, so it stays invisible to the resolver: Vitest
  4.0.x keeps its fallback and Vitest 5 never looks for it.

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
