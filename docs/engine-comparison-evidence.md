# Engine Comparison — Evidence & Backing

> **Purpose:** the empirical backing for `vitest-native`'s `mock` vs `native` engines, so
> user-facing guidance ("which engine when") rests on verified facts, not vibes. Every
> claim here is tied to a test file or a measurement. **Be honest in derived docs** — where
> the engines are at parity, say so; don't oversell `native`.
>
> **Environment for all measurements below:** `react-native@0.84.1`, `react@19.2.4`,
> `react-test-renderer@19.2.4`, `@testing-library/react-native@12.9.0`, `vitest@4.0.18`,
> Node 24, bun workspace, Apple Silicon (~10 cores). Re-measure on a CI baseline before
> publishing numbers.

---

## 1. TL;DR for guidance authors

- **`native` is the trust/fidelity engine.** It runs real React Native; only the native
  boundary is mocked. Use it for component/integration tests and anywhere a wrong answer
  would be expensive.
- **`mock` is the speed/simplicity engine.** A pure-JS reimplementation. Use it for
  pure-logic/unit tests, or where determinism and zero native deps matter more than
  device-accuracy.
- **They are at parity more often than expected** — the mock engine is well-built. The
  *concrete* per-feature wins for `native` are narrower than "it fixes everything": mainly
  **virtualization**, **host-tree structural fidelity**, and the **architectural** win
  (real third-party library JS runs; no per-library presets; no reimplementation treadmill).
- **Speed (head-to-head, §4) — native is faster than jest BY DEFAULT, cold and warm.**
  The native engine now ships `isolate: false` + `pool: threads` (reuses the worker
  runtime; RN's graph loads once via Node's cache instead of per file). At 60 files / 180
  tests: **native warm 1.40s vs jest 1.63s (1.16×); cold 3.79s vs 6.91s (1.8×)**. The warm
  lead **widens with scale** (1.16× @60 → 1.31× @100 files) because jest re-requires per
  file while native stays flat. **Verified safe:** full per-file isolation still holds under
  `isolate:false` (module state AND globalThis do not leak across files — measured). The
  cold disk-cache race is fixed (atomic writes). The **mock** engine stays `isolate:true`
  (its hand-written module-level state DOES pollute under isolate:false — 5 failures), so
  it's slower at scale; mock's value is determinism / no native deps, not scale-speed.

---

## 2. Behavioral fidelity — the differential evidence

Differential pair (same scenario, both engines):
`tests-native/fidelity.test.tsx` (native) ⨯ `tests/fidelity-divergence.test.tsx` (mock).

| Behavior | `mock` engine | `native` engine | Device reality | Verdict |
|----------|--------------|-----------------|----------------|---------|
| **FlatList of 100 items: how many render?** | **all 100** | **~10** (`initialNumToRender`) | ~10 mounted | **native correct; mock = false pass** |
| **`queryByText('item-99')` on that list** | **found** | **null (absent)** | absent until scrolled | **native correct; mock = false pass** |
| **`<Text>hi</Text>` host node type** | `"Text"` | `"RCTText"` + real props (`allowFontScaling`, `ellipsizeMode`, `accessible`) | `RCTText` | **native matches device tree** |

**Why FlatList is the headline:** virtualization is exactly what RN developers get wrong,
and the mock silently passes a test that fails on a real device. This single case is the
clearest justification for `native`.

### Parity — measured, NOT differentials (do not claim native "wins" here)
Probed this session; both engines behave the same, so they are **not** selling points for
`native`:

| Behavior | Result | Note |
|----------|--------|------|
| `Animated.timing(...).start()` then read value | **both jump to end synchronously** | Real RN disables time-based animation when `isTesting` is true (jest does the same). Not a fidelity win for native. |
| `TextInput` controlled `value` prop | **both reflect the controlled value** | mock implements this faithfully |
| `Pressable`/`Touchable` `disabled` suppresses `onPress` | **both suppress** | mock added this (commit `ca2ed51`) |

**Honest framing for guidance:** the mock engine is *good*. Native's behavioral edge is
concentrated in virtualization (FlatList/SectionList/VirtualizedList) and exact host-tree
shape — plus everything that follows from *running real code* rather than approximating it.

---

## 3. Coverage & compatibility evidence

Backed by `tests-native/render.test.tsx`, `matrix.test.tsx`, `rntl.test.tsx`,
`conformance.test.ts` (native suite: **39 tests passing**).

**`native` — verified working:**
- **RNTL (`@testing-library/react-native`) works out of the box** — `render`,
  `screen.getByText`, `fireEvent.press`, `fireEvent.changeText` all pass with **no
  configuration**; RNTL auto-detects host names from the real RN tree. *(rntl.test.tsx)*
- **20 core components render** without error: View, Text, Image, TextInput, ScrollView,
  FlatList, SectionList, Modal, Pressable, all Touchables, ActivityIndicator, Button,
  Switch, RefreshControl, StatusBar, SafeAreaView, KeyboardAvoidingView, ImageBackground.
  *(matrix.test.tsx)*
- Real `StyleSheet.flatten`/`compose`, `Platform.select`, `Dimensions`, `PixelRatio`,
  `Appearance.getColorScheme`, `I18nManager`. *(matrix/conformance)*

**`native` — known gaps / requirements (state these in guidance):**
- Requires **`@react-native/babel-preset` + `@babel/core`** in the project (present by
  default in RN apps; optional peer deps). Without them, `native` errors with a clear
  message.
- **Cosmetic only:** a React `"update to LogBoxStateSubscription was not wrapped in act()"`
  warning can appear when real RN emits a dev `console.warn` (e.g. SafeAreaView
  deprecation) during interaction. Tests pass. A blunt `LogBoxData` mock breaks Modal/RNTL,
  so the correct fix is a runtime `LogBox.ignoreAllLogs()` in setup (not yet done).
- **Third-party libraries** (reanimated, navigation, gesture-handler): their *real* JS runs
  under `native` — a structural advantage over the mock engine's per-library presets — but
  breadth across versions is **not yet verified** (Phase 3).

**`mock` — coverage:** ~1,167 passing tests across the full hand-written RN surface
(components, APIs, native modules, presets). Mature and broad, but fidelity is capped by
construction (see §5).

---

## 4. Speed evidence — HEAD-TO-HEAD (the real numbers)

Reproducible harness: `bench/` (jest RN-preset vs vitest-native native vs mock, **identical
RTR-based suite**, same machine/moment; `bench/run.mjs`). Numbers below: **25 files / 75
real-RN tests, warm median of 4 runs, Node 24, 10 cores.** Re-run on a CI baseline before
publishing.

| Runner | Cold | Warm (median) | vs jest (warm) | Reliable? |
|--------|------|---------------|----------------|-----------|
| **jest** (RN preset) | ~6.0s | **1.37s** | 1.00× | ✅ |
| **vitest-native** (default isolation) | ~5.2s | **3.25s** | **0.41× (2.4× slower)** | ✅ correct |
| **vitest-native** (`isolate: false`) | ~3.8s | 1.31s | **1.04× (≈ jest)** | ⚠️ **flaky** (state pollution) |
| **vitest-mock** | ~1.4s | 1.45s | 0.94× | ✅ |

**Scaling head-to-head (warm median; native = shipped default isolate:false + pool:threads):**

| Suite | jest (warm / cold) | native (warm / cold) | native warm speedup |
|-------|--------------------|----------------------|---------------------|
| 25 files / 75 tests | 1.37s | 1.30s | 1.0× |
| 60 files / 180 tests | 1.63s / 6.9s | **1.40s / 3.79s** | **1.16× warm, 1.8× cold** |
| 100 files / 300 tests | 1.99s | **1.52s** | **1.31×** |

**Conclusions:**
1. **Native is faster than jest by default — warm and cold — and the warm lead widens with
   scale** (RN loads once per worker; jest re-requires per file → grows ~linearly while
   native stays flat). Structural advantage jest cannot match.
2. **Verified safe:** under `isolate:false` in this setup, neither module state NOR
   globalThis leaks across files (measured with deliberate pollution probes). So no
   per-file reset machinery was needed for the native engine.
3. **`mock` stays `isolate:true`** — its hand-written module-level state pollutes under
   isolate:false (5 test failures), so it's slower at scale. That's an accepted trade: mock
   is the determinism / no-native-deps lane, not the scale-speed lane.
4. **The earlier "~4× faster" was native-vs-native** (isolate modes), not vs jest. The real
   vs-jest figures are the table above.

**Bug fixed:** native disk-cache write race under worker concurrency (atomic temp+rename) —
eliminated cold flakiness. All on branch `design/dual-engine`.

**Further speed headroom (future):** ~1s of the native warm time is fixed vite/vitest
startup; a pre-shipped transform cache would cut cold further; the per-test render cost is
shared with jest. Re-run `bench/` on a CI baseline before publishing exact numbers.

---

## 5. Maintenance & risk (architectural backing)

| | `mock` | `native` |
|--|--------|----------|
| **Surface we maintain** | ~2,900 LOC reimplementing RN's public API + per-library presets | the native boundary only (~9 modules in `src/native/boundary.mjs`) |
| **Tracks RN versions by** | manual mirroring (drift-prone; mock hardcodes some versions) | running RN's real code; boundary can reuse Meta's own `jest/mocks/*` |
| **Fidelity ceiling** | structural — approximates, so false passes are possible (see §2) | inherits real RN behavior |
| **Failure mode** | silent false pass (worst kind for a test tool) | a missing boundary mock = a *loud* error, easy to find & fix |
| **Conformance strategy** | ports RN's own tests (good, but can only cover the pure-function layer) | RN's own tests run against real RN |

---

## 6. Open questions / not-yet-proven (do not claim these as facts)

1. ~~Live jest head-to-head~~ **DONE (§4)** — result: vitest-native is *slower warm*,
   *faster cold*. A `jest-expo` (not bare RN-preset) variant would likely be *slower* than
   the baseline measured (it transforms more), i.e. friendlier to us — worth running too.
2. **`isolate: false` correctness** — flaky today (state pollution). Needs per-file reset
   (boundary mock state, fake timers, listeners, mounted trees, RN module-level
   singletons). This + per-file overhead is the path to actually beating jest warm.
3. **Native disk-cache write race** under worker concurrency (intermittent cold failure).
3. **Third-party library breadth** under `native` (reanimated/navigation/gesture-handler
   across versions).
4. **RN version matrix** (0.78 / 0.82 / 0.84+) for both the transform and the boundary set.
5. **RNTL v14 + `universal-test-renderer`** integration (current evidence is RNTL v12 +
   `react-test-renderer`).

---

## 7. Draft "which engine when" (backed by the above — refine into user docs)

- **Use `native` when:** testing components/screens, integration flows, anything using
  `@testing-library/react-native`, virtualized lists, or third-party RN libraries; or any
  test where a false pass would be costly. *(Backing: §2, §3.)*
- **Use `mock` when:** testing pure logic/reducers/utilities, or when you want maximum
  speed and determinism and your code doesn't depend on real RN behavior; or when you can't
  add the babel peer deps. *(Backing: §3, §4.)*
- **Mixed projects:** per-glob selection — `native` for `*.integration.test.tsx`, `mock`
  for `*.unit.test.ts` — once that lands (designed, not yet built). *(Backing: design spec
  §3.)*
- **Honest caveat to include:** for many individual APIs the two engines agree (§2 parity
  table). `native`'s value is concentrated in virtualization, host-tree fidelity, real
  third-party code, and the elimination of the reimplementation treadmill — not in fixing a
  long list of per-API bugs.

---

## 8. Test/measurement index (where each claim lives)

- Native render + host tree: `packages/vitest-native/tests-native/render.test.tsx`
- Component/API matrix: `packages/vitest-native/tests-native/matrix.test.tsx`
- RNTL integration: `packages/vitest-native/tests-native/rntl.test.tsx`
- Real-RN conformance: `packages/vitest-native/tests-native/conformance.test.ts`
- Fidelity (native side): `packages/vitest-native/tests-native/fidelity.test.tsx`
- Divergence (mock side): `packages/vitest-native/tests/fidelity-divergence.test.tsx`
- Architecture & rationale: `docs/superpowers/specs/2026-06-03-vitest-native-dual-engine-design.md`
- Native engine internals & gotchas: `docs/superpowers/plans/2026-06-03-native-engine-phase0.md`
