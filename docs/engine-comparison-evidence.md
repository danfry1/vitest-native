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
- **Speed:** `native` is competitive cold and can be **~4× faster than its own default**
  with a shared runtime (`isolate: false`) — a mode jest structurally cannot match.
  A live `jest-expo` head-to-head is **not yet run** (see §6, Open Questions).

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

## 4. Speed evidence

All `native` numbers use the on-disk transform cache (cold run populates it; warm = cache
hit). The ~241 RN-file transforms happen once per RN version and can be pre-shipped.

| Scenario | Measurement | Source |
|----------|-------------|--------|
| `native`, 8 tests, 1 file, warm | **~0.47s** | spike `.tmp-spike2` |
| `native`, 8 tests, cold (populate cache) | ~1.9s | spike |
| `native`, 40 files / 80 render tests, **`isolate: true`** (default), warm | **~3.5s wall / ~20s CPU** | spike scale bench |
| `native`, 40 files / 80 render tests, **`isolate: false`** (shared runtime), warm | **~0.91s wall / ~4.3s CPU** | spike scale bench |
| `mock`, 1,167 tests, warm | ~1.5s | package `test` |

**Key facts for guidance:**
1. **Per-file isolation re-executes the real RN graph** (~500ms CPU/file). This is the cost
   jest also pays → on fidelity-matched suites `native` is **parity-to-modestly-faster**,
   not a blowout.
2. **`isolate: false` reuses the RN runtime across files → ~4× faster.** Jest *cannot* do
   this (it re-requires the registry per file). This is `native`'s structural speed moat —
   but it shares module state across files, so it needs state-reset discipline (not yet
   built; see §6).
3. **`mock` is the fastest** for equivalent logic tests because it skips real RN entirely.

**Not yet measured:** a live `jest-expo` head-to-head on identical suites. Until then,
phrase speed as "competitive, with a structural shared-runtime advantage," **not** a
specific multiple over Jest.

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

1. **Live `jest-expo` speed benchmark** on identical suites — the real proof of "faster
   than Jest."
2. **`isolate: false` correctness at scale** — needs per-file state reset (boundary mock
   state, fake timers, listeners, mounted trees, RN module-level singletons).
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
