# Roadmap: from "good for new tests" to "confident for real RN apps"

**Status as of 2026-06-05, branch `design/dual-engine`.** This is an evidence-based
handoff. Every claim below was verified this session (commits `aa871fa`, `39258a4`,
`83a4d31`, `cb5811c`, `4d69b50`, `0897c93`). Read this top to bottom before starting.

---

## UPDATE (2026-06-08): migration hardening + the missing proof, delivered

The "decisive missing proof" below (a real production app's *existing* suite running
under the plugin) now exists, and the systemic blockers it surfaced are fixed.

**Two real-app migrations:**
- **obytes template** (RN 0.81) — existing Jest suite → **39/40** under `engine:'native'`.
- **Rocket.Chat** (RN 0.81, deeply Jest-coupled production chat app) — existing RNTL
  suite → **0 → 79 tests** (10 files green). Full write-up + honest gaps:
  [`real-app-validation/rocketchat.md`](real-app-validation/rocketchat.md).

**Systemic fixes shipped (each test-covered):** transitive preset redirect through the
Node require/loader hooks; `jest.mock` auto-hoisting + Jest CJS interop
(`jestMockTransform` + `vitest-native/jest-compat`); automatic JSX runtime;
extensionless-ESM resolution; TS-aware `jest.requireActual`; a `globalThis.expo` shim
for `expo-modules-core`; and new presets (device-info, mmkv, svg, webview) +
gesture-handler Buttons + reanimated completeness.

**Net:** "migrating an existing jest suite (proven not turnkey)" → migratable with a
documented pass rate; the remaining cost is per-suite native-lib mocks (libs with no
preset) + app-specific test wiring, not plugin capability. The "NOT confident yet"
framing below is **superseded** by this update; the P0/P1/P2 detail remains for context.

---

## Where we are (honest)

**Confident TODAY for:** new unit/logic tests (mock engine — 1181 tests, conformance
suite); new component tests where third-party deps are pure-JS or have presets;
a11y/fidelity-sensitive tests (native engine).

**NOT confident yet for:** a full real app (third-party native libs don't work under the
native engine; mock-engine preset coverage is partial); migrating an existing jest suite
(proven not turnkey).

**The decisive missing proof:** nobody has run a real production app's suite green with
this plugin. All evidence is unit tests, conformance, controlled harnesses, and a bake-off
that got *blocked before executing*.

### Two engines (know the difference before touching code)
- `engine: 'mock'` — pure-JS reimplementation of RN. Fast, deterministic, zero deps. ~2,900
  lines of hand-mocks. Has auto-detect presets (Reanimated, Gesture Handler, Safe Area,
  Navigation, Expo). `src/mocks/*`, `src/presets/*`.
- `engine: 'native'` — runs REAL RN JS, mocking only the ~7-module native boundary. Higher
  fidelity (proven). `src/native/*`. Default is `isolate: true` (safe). Third-party native
  libs do NOT work here yet.
- The fidelity advantage is real but NARROW (a11y, RN-API validation, integration, mock-drift
  avoidance) — for typical "render + assert + fire event" tests, mock and native are equal.
  So the product is "fast mock for the 90%, real RN for the 10% that needs it, cross-check
  tells you which." Do not over-pitch native.

### Key assets already built (reuse these)
- **Stress suites** (native boundary regression gate): `tests-native/stress.test.tsx`,
  `tests-native/stress-apis.test.tsx`. Run: `bun run test:native`.
- **Cross-check** (mock vs native, finds mock bugs): `bench/crosscheck/` — `node diff.mjs`.
- **Fidelity proof** (native vs jest, proves the advantage): `bench/fidelity/`.
- **Leak harness** (proves isolate:true safety): `bench/leak/`.
- **transform allowlist** (third-party Flow/TS strip): `reactNative({ engine:'native',
  transform: ['pkg'] })` — `src/native/match.mjs` + loader/require hooks. Piece 1 of 3 for
  third-party support.
- Full context in project memory: `native-bulletproofing.md`, `product-strategy-2026-06.md`,
  `native-engine-custom-pool-spike.md`, `real-rn-engine-spike.md`, `native-engine-phase0.md`.

---

## P0 — Third-party native library support (THE blocker to real apps working)

Real apps all use Reanimated / Gesture Handler / Navigation / Safe Area / MMKV / SVG /
vector-icons. Until these work, no real app's tests run. Native-runtime libs (worklets,
native modules) CANNOT run in Node — they must be MOCKED, same as jest does. The `transform`
allowlist is for *run-real pure-JS* libs; native-runtime libs need *presets/mocks*.

### P0a. Native-engine preset/mock mechanism + third-party resolution
**DONE for Reanimated (2026-06-05).** The native engine now applies the SAME self-contained
presets the mock engine uses, so native-runtime libs are shadowed (not loaded) — exactly how
Jest mocks them. Reanimated 4.3.1 (which drags in `react-native-worklets`, unloadable in Node)
renders under `engine:'native'` with `<Animated.View>` + `useSharedValue`/`useAnimatedStyle`.

What landed:
- **Mechanism (the reusable part):** preset *virtual modules* now route through the native
  engine. `plugin.ts` `resolveId`/`load` redirect any active preset's package import to
  `\0virtual:preset:<pkg>` under native too (react-native itself stays externalized to Node's
  CJS graph). `config()` resolves active preset names synchronously (installed-package scan via
  `autoDetectPresetNames`) and passes them in `VITEST_NATIVE_PRESET_NAMES`; `native/setup.mjs`
  imports `../presets.mjs` and builds the mocks into `globalThis.__vitest_native_preset_mocks`
  (the same global the virtual modules read). **Any preset now works on native for free** — no
  per-lib wiring, no transform-allowlist/`.ts`-resolution gymnastics needed for native-runtime
  libs (those are the wrong tool here — they're for *run-real pure-JS* libs).
- **Reanimated preset fix:** it was missing `Animated.View/Text/Image/ScrollView/FlatList`
  (only had `createAnimatedComponent`). Added them as engine-agnostic lazy wrappers that resolve
  the *active* RN component at render via `createRequire(projectRoot)('react-native')` — the mock
  under mock-engine (CJS bridge), real RN under native (loader hooks). `src/presets/reanimated.ts`.
- **Proof (committed):** `tests-native/reanimated.test.tsx` (4 tests, green). `react-native-reanimated@4.3.1`
  + `react-native-worklets@0.9.1` added as devDeps so the proof shows the real lib *present and
  correctly shadowed* (importing it would crash on worklets — it never loads). Mock-engine
  coverage added in `tests/presets.test.ts`.
- Full verification: native 72 pass +1 todo; mock 1182 pass / 16 skipped; lint clean; typecheck clean.

**Gesture Handler / Safe Area / Navigation: DONE (2026-06-05).** Validated under native via the
same mechanism with ZERO per-lib changes (the mechanism is fully generic — only reanimated needed
a preset fix, for its missing component exports). Committed proof: `tests-native/third-party-stack.test.tsx`
(4 tests, green). Installed as devDeps: `react-native-gesture-handler@3.0.0`,
`react-native-safe-area-context@5.8.0`, `@react-navigation/native@7.2.5`,
`@react-navigation/native-stack@7.16.0` — all auto-detected + correctly shadowed.

Still open in P0 (minor):
- Subpath imports (`react-native-reanimated/foo`) aren't redirected (only the exact package name
  is). Fine for the common case; revisit if a real app needs it.
- Mock-engine render parity for the stack is the presets' original purpose (covered by
  `tests/presets.test.ts` at factory level); native is the genuinely new surface and is now proven.

### P0b. Audit + expand mock-engine presets
- The mock engine already has presets — verify they actually work against the current versions
  of those libs (they were not validated against real apps). Add the next most-common libs.

**Done when:** a representative third-party stack (Reanimated + Gesture Handler + Safe Area +
Navigation) renders/tests under BOTH engines, with committed tests.
**✅ MET (2026-06-05).** All four render/test under native (`tests-native/reanimated.test.tsx`,
`tests-native/third-party-stack.test.tsx`) and under mock (presets' original purpose,
`tests/presets.test.ts`). The native-engine preset mechanism is generic — new native-runtime
libs get shadowed for free by adding a preset.

---

## P0 — Real-app validation (THE missing proof; do in parallel with above)

This is the single highest-confidence-per-effort item. Pick a real RN app pinned near RN 0.84,
install safely (`--ignore-scripts`; no app had postinstall issues — verify), and get its suite
running green, reporting a pass rate.

**Critical blocker found this session:** real jest suites couple to jest at many levels
(`@jest/globals` via RNTL <12, `jest.mock('react-native')`, `@react-native/jest-preset`,
jest-native matchers). So "point native at an existing jest suite" is NOT turnkey. Two paths:
1. **Write NEW tests** against a real app's components (avoids jest-coupling) — faster path to
   a real pass-rate number.
2. **Build the jest-compat layer first** (see P1), then migrate the app's suite.

Path 1 is the faster proof. Subject candidate used this session: `react-native-paper`
(callstack) — RN peer `*`, no postinstall scripts, 87 RTL test files; baseline 158 tests pass
under jest@0.84. But its suite is jest-coupled, so write fresh tests against its components, or
pick a leaner app.

**Done when:** a real app (or its components) has a meaningful suite running green under the
plugin, with a documented pass rate and a list of any gaps found.
**✅ DONE (2026-06-05) — first real-app proof.** 32/32 fresh RNTL tests against **react-native-paper
5.15.1** (real TS source, RN 0.84.1) run green under `engine:'native'`, including Portal/Modal/Dialog/Menu
and a reanimated-backed component. Paper's native deps (reanimated 4.3.1, safe-area 5.7) were shadowed
automatically by the preset mechanism — ZERO plugin changes needed. Full methodology, component list,
honest gaps, and exact reproduction steps + committed test fixtures:
[`docs/real-app-validation/`](real-app-validation/). Caveats found (not plugin defects): RNTL must be
≥12 (the P1 item); paper-repo self-import needed a src alias. Next: a fuller app with navigation
graphs/screen flows, and a pass-rate against a *migrated existing* suite once P1 jest-compat ships.

---

## P1 — jest-compat layer + migration guide (adoption of existing suites)

**DONE (2026-06-05).** Productized + shipped.
- **`vitest-native/jest-compat` entry** (`src/jest-compat/`): `jestCompatSetup` (setup file installing
  a `jest` global backed by `vi` + sync `requireActual`/`requireMock`) and `jestCompatAliases()`
  (`@jest/globals` → vitest-globals shim for RNTL <12; `@testing-library/jest-native/extend-expect`
  → no-op). Subpath exports: `/jest-compat`, `/jest-compat/setup`, `/jest-compat/jest-globals`,
  `/jest-compat/extend-expect-noop`. Shims ship verbatim via the tsdown copy hook.
- **Validated end-to-end** in the bakeoff: `@jest/globals` import + `jest` global + a jest-style Paper
  component test all run under native. Even ran Paper's OWN `Badge.test.tsx` — it passed after a single
  snapshot re-record (`-u`); the only diff was real-RN host names (`RCTText` vs jest-preset `Text`).
- **Committed unit coverage:** `tests/jest-compat.test.ts` (5 tests).
- **Migration guide:** `docs/migrating-from-jest.md` — honest "not turnkey" framing + the per-suite
  cleanup (top-level `jest.mock`→`vi.mock` hoisting, RNTL ≥12, delete manual third-party native mocks
  since presets are automatic now, re-record snapshots, drop jest-preset). README now links it.
- Note: P0 (third-party native-lib support) already landed, so this can now be surfaced honestly —
  README "Migrating from Jest" section added, still explicitly NOT a drop-in.

---

## P2 — Maturity & hardening (raises confidence, not blocking)

- **LogBox `act()` papercut:** ✅ FIXED (2026-06-05). Root cause: AppContainer (mounted by RNTL's
  render) renders RN's dev `LogBoxNotificationContainer` → `LogBoxStateSubscription`, whose
  `componentDidMount` schedules a `setTimeout` setState that lands after the test's `act()`. Fix:
  the native boundary stubs `LogBoxNotificationContainer` to render null (it's dev-only UI), so the
  subscription never mounts. `boundary.mjs` + regression test `tests-native/logbox-act.test.tsx`.
- **`fireEvent.scroll` RNTL parity:** ✅ FIXED (2026-06-05). Root cause (confirmed vs jest+RN0.84+RNTL12):
  real ScrollView attaches `onStartShouldSetResponder` (→`false`) to its host; RNTL treats any host
  with that prop as a touch responder and gates events on its return → `fireEvent.scroll` no-ops.
  RN's own jest preset sidesteps this by mocking ScrollView entirely. We match the EFFECT minimally:
  the mocked `RCTScrollView` host drops the responder-negotiation props (`onStartShouldSetResponder*`,
  `onMoveShouldSetResponder*`) while keeping the REAL ScrollView component (so FlatList/SectionList/
  VirtualizedList stay intact). `boundary.mjs` (MOCK_NATIVE_COMPONENT); the `it.todo` in
  `tests-native/stress.test.tsx` is now a real passing test.
- **Multi-RN-version CI matrix:** ✅ DONE (2026-06-05). `.github/workflows/native-rn-matrix.yml`
  runs the native suite against every supported RN minor (matrix, fail-fast: false) on push/PR/
  weekly. **Supported range verified locally: RN 0.81–0.84** (all pass the full native suite incl.
  SectionList + fireEvent.scroll). RN 0.80 and earlier fail host-component detection (a transform/
  syntax difference) — that's the floor. The workflow pins `react-native` + `@react-native/babel-preset`
  per matrix entry, rebuilds, and runs `test:native`.
- **Conformance expansion + interpolation gaps:** ✅ MOSTLY DONE (2026-06-05). Closed 13 of the
  skipped interpolation tests by porting RN's exact algorithm into the Animated mock
  (`src/mocks/apis/Animated.ts`): -Infinity/Infinity ranges (with easing), hex/rgba/named **color
  interpolation** → `rgba(r,g,b,a)` with rgb rounded + alpha to the nearest thousandth, arbitrary
  suffix/format strings, and the validation invariants (monotonic input, `[-Infinity, Infinity]`
  rejected, matched lengths, consistent color/pattern, no chaining off a string interpolation).
  `tests/rn-conformance/rn-Interpolation.test.ts` now 25 pass / 2 skipped. Remaining skips are
  genuinely out of scope: PlatformColor (opaque native object — RN itself throws in interpolation)
  and `__getNativeConfig()` (no native animated graph in the mock). Mock suite: 1200 pass / 3 skipped.
- **1.0 prep:** ✅ RECONCILED (2026-06-05). The older production-readiness plan
  (`docs/superpowers/plans/2026-03-22-production-readiness.md`) now carries a reconciliation banner +
  per-pillar status and points here as the source of truth; its spec is marked Superseded. Its done
  substance: Trust Foundation, interpolation conformance, multi-version CI. Its still-open, still-valuable
  items (retained there): coverage/Codecov, bundle-size tracking, security automation (Dependabot/CodeQL),
  remaining docs guides, formal API audit + the 1.0 cut (still `0.3.0`).
- **`pool.mjs` spike** (uncommitted, `src/native/pool.mjs` + `tests-native/vitest.pool.config.mts`):
  a custom Vitest-4 pool prototype for a future "hot runtime + surgical reset" (would reclaim
  native speed safely). Not wired up. See `native-engine-custom-pool-spike.md`.

---

## Suggested sequence

1. **P0 third-party support (Reanimated as the proof)** + **P0 real-app validation (Path 1,
   new tests)** in parallel — these together flip "confident for real apps."
2. **P1 jest-compat + migration guide** — unlocks migrating existing suites.
3. **P2 maturity** — toward 1.0.

The north star: a real app's meaningful test suite running green on both the common third-party
stack and the plugin, with a published pass rate. That's the proof that converts "good for new
tests" into "confident for real apps."
