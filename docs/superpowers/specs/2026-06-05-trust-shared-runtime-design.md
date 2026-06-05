# Trust the Shared Runtime — `isolate:false` correctness for the native engine

**Status:** Design — approved direction (brainstormed 2026-06-05)
**Date:** 2026-06-05
**Author:** Daniel Fry (with Claude)
**Branch:** `design/dual-engine`

## 1. Goal

Make `engine: 'native'` **provably safe** under `isolate: false` (the shared-worker
runtime that is the engine's speed moat), so that:

1. The speed moat is trustworthy — no order-dependent false passes/fails.
2. `native` becomes a credible **default** (the next spec, "the engine you don't
   configure", depends on this being true).
3. The current contradiction in `docs/engine-comparison-evidence.md` ("verified safe"
   in §1 vs "flaky / state pollution" in §4/§6) is resolved with **committed, CI-enforced
   evidence** rather than a one-off measurement.

The cosmetic LogBox `act()` warning was originally paired into this spec but, after
investigation (§4.3), has no cheap fix and is **deferred** — it does not gate trust (all
tests pass).

This is the foundation spec of the "make it the ultimate RN testing tool" roadmap. The
later specs (real `auto`/per-glob, boundary shim over Meta's `jest/mocks/*`, ship/docs)
all assume the shared runtime is trustworthy.

> **Investigation note (2026-06-05):** before planning, the shared-runtime risk was probed
> empirically. Finding: **isolation already holds for every outcome-observable category**
> (§4.2 table) because vite-node re-instantiates the module graph and globals per file. The
> spec's original emphasis on a reset layer is therefore obsolete; this spec's real, smaller
> deliverable is to **lock that guarantee in CI** so it cannot silently regress.

## 2. Background

The native engine externalizes React Native so it loads once through Node's CJS graph.
Under `isolate: false` + `pool: threads`, a worker keeps that graph **hot and reused
across many test files** — this is why native beats jest warm and the lead widens with
scale (jest re-requires per file; native does not). See `docs/native-engine-performance.md`
and `docs/engine-comparison-evidence.md` §4.

The risk: a reused graph means **shared mutable state**. If file A mutates an RN
module-level singleton (or leaves a listener / timer / mounted tree behind) and file B
observes it, tests become order-dependent. The evidence doc claims this was *measured* not
to leak — but with `singleThread: true` and `sequence.shuffle: false` (a friendly case),
no committed test enforces it, and there is **no reset safety net** in
`src/native/setup.mjs` today.

"Ultimate" requires this be *enforced*, not *hoped*.

## 3. The contract: what "isolated" means

Isolation is defined as an **executable specification** — an adversarial suite where, for
each state category, one file deliberately pollutes and a sibling file asserts a clean
baseline. The suite runs under the **real shipped config** (`isolate: false`,
`pool: threads`) with **`sequence.shuffle` enabled** so file order cannot mask a leak.

State categories that must remain isolated across files:

| # | Category | Example pollutant | Clean-baseline assertion |
|---|----------|-------------------|--------------------------|
| 1 | RN module singletons | `Dimensions.set(...)`, force `Appearance`/`AppState`/`I18nManager`/`PixelRatio` | next file reads boundary defaults (390×844, light, etc.) |
| 2 | Native-boundary state | mount many host components (bumps `mockNativeComponent` `__tag`); poke `NativeModules`/TurboModule stubs | next file's first tag is deterministic; stubs return defaults |
| 3 | Event-emitter listeners | add `DeviceEventEmitter` / `AppState` / `Keyboard` / `Appearance` listeners and never remove | next file sees zero stale listeners (no double-fire) |
| 4 | Timers | leave pending `setTimeout` / fake timers installed | next file starts with real timers, no pending callbacks |
| 5 | Mounted React trees | create RTR trees without unmounting; mount components with subscriptions | next file: no leftover effects fire; renderer count baseline |
| 6 | `globalThis` | write `globalThis.__leak` mid-test | next file does not observe it (and `installGlobals` values remain stable/idempotent) |
| 7 | LogBox | accumulate logs via real RN dev-warnings | next file: no act() warning surfaced; LogBox state does not bleed |

The table is the definition of done. A category passes when its adversarial pair is green
under shuffled `isolate:false` across **3 shuffle seeds** in CI.

## 4. Design

### 4.1 Adversarial isolation suite — `tests-native/isolation/`

The executable contract from §3. Paired `*.pollute.test.tsx` / `*.assert.test.tsx` files
per category (or a shared pollutant file + multiple asserters). Runs via the existing
`test:native` config — **no `singleThread`** (we want real worker reuse) and
`sequence: { shuffle: true }`. This is what converts "measured once" into "enforced in CI
forever." It is also the regression guard for every future change to the boundary or RN
version bump.

### 4.2 Reset layer — PROVEN UNNECESSARY (suite is the enforcement)

**Updated 2026-06-05 after investigation.** Adversarial probing under the *shipped* config
(`isolate:false` + `pool:threads`, forced to a single worker with `singleThread` — the
worst case for sharing) showed **no category leaks across files**:

| Category | Probe | Result |
|----------|-------|--------|
| RN module singletons | file A `Dimensions.set({width:999})` + `Appearance.setColorScheme('dark')` | file B sees 390 / light — **clean** |
| Module identity | compare `Dimensions` object across files | **different instance** per file (graph re-instantiated per file) |
| `globalThis` | file A writes `globalThis.__marker` | file B sees `undefined` — **clean** |
| Emitter listeners | file A adds a `DeviceEventEmitter` listener | file B `listenerCount` = 0 — **clean** |
| Fake timers | file A `vi.useFakeTimers()`, never restores | file B `vi.isFakeTimers()` = false — **clean** |

Mechanism: vite-node gives each test file a fresh module graph and fresh globals even under
`isolate:false`; the speed comes from a warm worker + disk-cached Flow transforms, not a
shared singleton. So **no `reset.mjs` is built**. The adversarial suite (§4.1) *is* the
safety net: if a future RN bump, boundary edit, or config change ever introduces a leak, the
suite fails in CI. A reset is added later **only if** the suite ever goes red — and then
only for the proving category, never re-executing the RN graph.

**If** a reset is ever needed (suite goes red in future), the hard constraint is: reset MUST
NOT re-execute or re-require the RN module graph (that would defeat the moat) — it may only
mutate *live* singletons back to boundary defaults (`Dimensions.set`,
`Appearance.setColorScheme('light')`) and tear down subscriptions (`removeAllListeners()`),
all of which were confirmed present on the real RN API this session. This is documented as
the future pattern, not built now.

### 4.3 LogBox act() warning — DEFERRED (empirically, no cheap fix)

**Updated 2026-06-05 after investigation.** The intended fix (`LogBox.ignoreAllLogs()` in
setup) was tested and **does not work**. Measured this session under the native suite
(baseline: 3 warnings):

- `LogBox.ignoreAllLogs()` in `setup.mjs` (per the evidence doc's suggestion): **still 3**.
- `LogBox.ignoreAllLogs()` synchronously at the top of an individual test file: **still
  fires for that file**.
- A no-op `Libraries/LogBox/LogBox.js` facade mock in the boundary (all `ILogBox` methods
  no-ops): **still 3**, and all 39 tests stayed green.

Root cause: the warning is a React state update inside `LogBoxStateSubscription`, which
lives in `Libraries/LogBox/Data/LogBoxData.js` and is reached by a path that **bypasses the
`LogBox.js` facade**. The only mock that would intercept it is a `LogBoxData` mock — which
the evidence doc records as breaking Modal/RNTL. A correct fix therefore needs a careful,
surgical `LogBoxData` shim validated against Modal + RNTL, which is its own focused effort.

**Decision:** this warning is **cosmetic** (all 39 native tests pass) and is **deferred to a
tracked follow-up**, not bundled into this foundational change. Recorded so the next
attempt starts from these findings rather than re-deriving them.

### 4.4 Documentation reconciliation

Once the suite is green, update `docs/engine-comparison-evidence.md` §4 table note and §6
item 2 so `isolate:false` is described as **enforced-isolated (CI-gated)**, not flaky.
Update the cache-race line if needed. Keep the honest tone of the doc.

## 5. Components & interfaces

- `tests-native/isolation/*` — the adversarial suite (the deliverable). Paired
  pollute/assert files per category from §3.
- `tests-native/isolation.config.mts` — a dedicated config: `isolate:false` +
  `pool:threads` with `singleThread: true` (forces worst-case sharing into one worker so a
  leak cannot hide behind worker distribution) + `sequence: { shuffle: true }`. Separate from
  the main `tests-native/vitest.config.mts` so the main run stays multi-worker/fast and
  order-stable.
- `package.json` — add `test:native:isolation` script.
- `.github/workflows/ci.yml` — run the isolation suite (3 shuffle seeds) after the native
  suite.
- `docs/engine-comparison-evidence.md`, `docs/native-engine-performance.md` — reconcile to
  the measured reality (§4.4).

No `reset.mjs` and no `setup.mjs`/`boundary.mjs` changes are built (see §4.2 — proven
unnecessary). Each unit stays small: the suite *defines and enforces* isolation; nothing
else changes in the runtime.

## 6. Testing strategy

- **Primary:** the §3 adversarial suite, run under shuffled single-worker `isolate:false`
  across 3 seeds in CI.
- **Regression:** the existing 39 native tests stay green; the mock engine remains
  `isolate:true` and is untouched (re-run its ~1,164 tests).
- **Determinism:** run the isolation suite 3× locally across seeds to confirm no flakiness.
- Each isolation test is a **characterization/locking test**: it asserts the isolation that
  already holds, so its expected first-run result is PASS. Its value is regression
  protection — it turns red the day a change breaks the moat's safety.

## 7. Risks & open questions

- **False confidence from multi-worker distribution** — if the isolation suite ran
  multi-worker, two files might never share a worker and a real leak could pass. Mitigated by
  forcing `singleThread: true` in the isolation config (worst-case sharing).
- **A category we didn't probe could leak** (e.g. `process.env`, real `setInterval`
  handles). The suite should include a deliberate process-resource probe; if it ever leaks,
  add the narrow reset per §4.2.
- **LogBox act() warning** — deferred (§4.3); tracked as a separate follow-up with findings
  recorded.
- **Windows** — suite is JS-level (no paths); include in the RN-version/OS matrix later.

## 8. Non-goals (other roadmap specs)

- Real `auto` / per-glob engine selection (next spec).
- Replacing the hand-written boundary with a shim over `react-native/jest/mocks/*`.
- RNTL v14 / `universal-test-renderer` migration.
- RN version matrix (0.78 / 0.82 / 0.84) in CI.
- Third-party library breadth (reanimated / navigation / gesture-handler).
- Merge / release / user-facing docs.

## 9. Success criteria

1. The adversarial isolation suite is green under shuffled single-worker `isolate:false`
   across 3 seeds, in CI — covering all 7 §3 categories plus a process-resource probe.
2. The suite is wired into CI and a `test:native:isolation` script; a deliberately
   introduced leak (verified once during development) makes it go red.
3. `docs/engine-comparison-evidence.md` and `docs/native-engine-performance.md` no longer
   contradict themselves; `isolate:false` is documented as CI-enforced per-file-isolated,
   with the correct mechanism (fresh graph per file + warm worker + cached transforms).
4. Existing 39 native tests and the full mock suite remain green.
5. The LogBox act() warning is recorded as a deferred follow-up with findings (§4.3) — out
   of scope here.
