# vitest-native: Dual-Engine Architecture (mock + native)

**Status:** Design — approved direction, spike-validated
**Date:** 2026-06-03
**Author:** Daniel Fry (with Claude)

## 1. Goal

Make `vitest-native` the go-to testing solution for React Native: a tool developers
**trust** (results match real RN), love the **DX** of (one install, zero config, fast),
and get **genuine use** from.

The north star is *trust + DX*, not architectural purity. We are willing to run real
React Native JS, reuse Meta's own machinery, or be "a thin layer" — whatever makes the
tool most useful and trustworthy.

## 2. The core insight

Jest's `jest-expo`/RN preset is trusted because it runs **real React Native JS** and
mocks only the small **native boundary**. It is slow not because it runs real RN, but
because of the 40-plugin Babel chain, `transformIgnorePatterns` re-transform tax, the
Haste map crawl, and per-worker re-init. **Those costs are removable** — esbuild handles
user code, Babel runs only on RN's Flow files (and is disk-cached), and Vite's runner
replaces Haste.

So we can keep Jest-level fidelity *and* be fast. Nobody has shipped this; two prior
Vitest+RN attempts (one by a Vitest core maintainer) both chose the lower-fidelity
full-mock road and stalled.

## 3. Product shape: one plugin, three engines

```ts
// vitest.config.ts
import { reactNative } from "vitest-native";
export default defineConfig({ plugins: [reactNative({ engine: "auto" })] });
```

| engine | What it does | Fidelity | Speed | Use for |
|--------|--------------|----------|-------|---------|
| `mock` | Today's hand-written pure-JS RN reimplementation | Lower (approximate) | Fastest | Pure logic / unit tests |
| `native` | Runs **real** RN JS; mocks only the native boundary | Jest-level | Fast (warm ~0.5s) | Components / integration / anything where trust matters |
| `auto` | Picks per project (and optionally per-glob) | — | — | Default |

- **`mock`** = the existing engine, *kept and repositioned* as the opt-in fast lane.
- **`native`** = the spike-validated real-RN engine (see §4).
- **`auto`** = conservative default — resolves to `mock` today, designed to flip toward
  `native` as it hardens. Supports **per-glob selection**, e.g. `native` for
  `*.integration.test.tsx`, `mock` for `*.unit.test.ts`.

## 4. The `native` engine (spike-validated architecture)

Validated end-to-end in `packages/vitest-native/.tmp-spike2/` — real RN 0.84 renders the
authentic `RCTView`/`RCTText` tree with real `StyleSheet`, `Platform`, `Animated`,
`FlatList`. **8/8 tests green.**

### 4.1 Single graph, not dual

The decisive lesson from spike 1: do **not** split RN between Vite's ESM pipeline and
Node's `require`. RN's pervasive lazy `require('./X')` creates a parallel native graph
that `vi.mock` can't reach, and where the two graphs meet you get ESM/CJS interop seams
(dual module instances → `undefined` exports in circular deps; this broke the Animated
chain). The fix: load **all** of RN through **one** Node CJS graph (jest's model).

### 4.2 Mechanism

1. **Externalize RN** so vite-node hands it to Node, not Vite's transformer:
   `test.server.deps.external: [/[\\/]react-native[\\/]/, /[\\/]@react-native[\\/]/]`.
   User/test code stays on Vite/esbuild (fast).
2. **Two transform hooks**, because the two module-loading paths need different
   interception (key finding: `import()` bypasses `Module._extensions`):
   - **ESM loader hook** via `module.register("./loader.mjs")` — intercepts vite-node's
     top-level externalized `import('react-native')`.
   - **`Module._extensions['.js']` hook** — intercepts RN's internal CJS `require()`
     chains.
   Both: Flow-strip RN files via `@react-native/babel-preset` (the *only* transformer
   that lowers RN 0.84's `component View(...)` syntax — `flow-remove-types` cannot), and
   serve **boundary mocks**.
3. **Disk-cached transforms** keyed by `path + mtime + size + rnVersion + presetVersion`.
   Cold populates the cache (~1.9s for ~241 RN files); warm reads it (~0.47s). The cache
   can be **pre-built and shipped** with the package so even cold is fast.
4. **Platform-extension resolution** (`.ios.js` / `.native.js` / `.js`): patch
   `Module._resolveFilename` (require path) and the loader's `resolve` hook (import path).
5. **Globals** RN expects, ported from `react-native/jest/setup.js`: `__DEV__`,
   `requestAnimationFrame`, `nativeFabricUIManager`, `__fbBatchedBridgeConfig`,
   `IS_REACT_NATIVE_TEST_ENVIRONMENT`, etc.

### 4.3 Native boundary mock set (~the only thing we maintain)

Mirrors `react-native/jest/setup.js`. ~7 modules proven sufficient for the core surface;
full set ~22:
`TurboModuleRegistry`, `NativeModules` (BatchedBridge), `NativeComponentRegistry`,
`requireNativeComponent`, `ViewNativeComponent`, `InitializeCore`, `UIManager`, plus the
leaf host-component mocks (View/Text/Image/ScrollView/TextInput/Modal/...).

**Strategic simplification:** Meta ships and maintains these as 21 files in
`react-native/jest/mocks/*`. Phase 2 reuses them directly via a `jest`→`vi`/global shim,
so the boundary maintains itself upstream and tracks every RN version. This collapses our
maintenance surface from "all of RN" (today's mock engine) to "a thin compatibility shim."

### 4.4 The speed moat: shared RN runtime (`isolate: false`)

Scale-benchmarked (40 component files / 80 real-RN render tests, warm):

| Mode | Wall | CPU | Notes |
|------|------|-----|-------|
| `isolate: true` (default) | ~3.5s | ~20s | RN graph re-executed per file (jest pays this too → parity) |
| **`isolate: false`** | **0.91s** | **4.3s** | RN graph loaded **once per worker, reused** → ~4× faster |

Jest **structurally cannot** reuse the module graph across files (it re-requires the
registry per file). A persistent Vitest worker can hold the RN runtime hot. This is our
competitive moat. The `native` engine's headline feature is therefore **"isolated tests on
a shared RN runtime"**: keep the expensive/stable RN graph hot, reset only the mutable bits
between files (boundary mock state, timers, listeners, mounted React trees). Tractable
because we own the boundary layer. Default-isolation remains available as the safe mode.

### 4.5 Renderer

Works today with `react-test-renderer@19`. Target **RNTL v14 + `universal-test-renderer`**
(standalone, `react-reconciler`-based, explicitly Jest-or-Vitest) to shed the deprecated
`react-test-renderer`. The boundary mocks already produce the `RCTView`-shaped host tree
RNTL queries expect.

## 5. The `mock` engine

Unchanged in behaviour — the existing ~2,900-line implementation. Repositioned: it is now
the *fast lane*, not the only option. We keep its genuine strengths (faithful pure-function
ports of Easing/processColor/StyleSheet.flatten/Animated combinators; the
conformance-via-RN's-own-tests harness; the DX hygiene) and stop pretending it can reach
full fidelity — that's what `native` is for.

## 6. Phasing

- **Phase 0 — `native` MVP behind the flag.** Productionize the spike: the two hooks +
  disk cache + boundary-as-a-module + platform resolution, wired through
  `reactNative({ engine: 'native' })`. Port the spike tests; run RN's own conformance
  suite under `native`. Ship `engine` option (default stays `mock`).
- **Phase 1 — Fidelity + boundary reuse.** Replace hand-written boundary with a shim over
  `react-native/jest/mocks/*`. Build a component coverage matrix (every core component
  renders + behaves like real RN). RNTL v12/v14 compatibility tests.
- **Phase 2 — `auto` + speed.** Per-glob engine selection; pre-built shipped transform
  cache; a CI benchmark suite vs `jest-expo` to make the speed claim *measured*, not
  hoped.
- **Phase 3 — Ecosystem + flip.** Validate real-JS third-party libs (reanimated,
  navigation, gesture-handler) under `native` (their real code runs — presets shrink to
  native-bit stubs). Docs, migration guide from jest-expo, then flip `auto` default to
  `native`.

## 7. Risks & open questions

- **`module.register` loader is worker-global.** Verify no interference with other Vite
  plugins / non-RN deps; scope hooks tightly to RN paths (done in spike).
- **RN version churn.** Mitigated by reusing Meta's mocks (Phase 1) and version-keying the
  cache. Needs a CI matrix across RN versions (0.78 / 0.82 / 0.84+).
- **Speed claim is not yet measured vs *live* jest-expo.** Scale benchmark shows ~4× via
  shared runtime, but vs *known* jest behaviour, not a head-to-head. Phase 2 runs the real
  bake-off.
- **Shared-runtime test isolation (`isolate: false`).** The moat depends on reusing the RN
  graph across files, which shares module state. Must reset mutable state between files
  (boundary mock state, fake timers, event-emitter listeners, mounted trees, RN
  module-level singletons like Dimensions/AppState) without re-executing the graph. This is
  its own workstream and the main correctness risk of the headline feature.
- **Windows path handling** in the hooks/resolver.
- **New Architecture / Fabric specifics** as RN moves NA-only (0.82+): boundary stubs for
  `getEnforcing` are required (already handled in spike).
- **react-test-renderer deprecation** — mitigated by targeting `universal-test-renderer`.
- **Pre-built cache distribution** — how to ship/version it without bloating the package.

## 8. Success criteria

1. `reactNative({ engine: 'native' })` runs a real RN component test suite green with no
   user config beyond the plugin.
2. RN's own conformance tests pass under `native` for the covered surface.
3. Warm-run a realistic component suite faster than `jest-expo` on the same tests
   (measured in CI).
4. Maintenance surface for `native` is the boundary shim only — no per-component
   reimplementation.
5. `mock` and `native` coexist behind one install; `auto` + per-glob works.

## 9. Non-goals

- Running on-device / in an emulator (that's the brittle high-cost path we explicitly
  reject).
- Testing via react-native-web/jsdom (wrong host vocabulary; tests RNW, not RN).
- 100% reimplementation of RN in the `mock` engine (structurally impossible; `native`
  is the fidelity answer).
