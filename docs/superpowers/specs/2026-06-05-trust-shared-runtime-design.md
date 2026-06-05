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

Plus a paired DX fix: eliminate the cosmetic LogBox `"update to LogBoxStateSubscription
was not wrapped in act(...)"` warning that makes a passing suite read as broken.

This is the foundation spec of the "make it the ultimate RN testing tool" roadmap. The
later specs (real `auto`/per-glob, boundary shim over Meta's `jest/mocks/*`, ship/docs)
all assume the shared runtime is trustworthy.

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

### 4.2 Minimal reset layer — `src/native/reset.mjs`

A new runtime module wired into the native setup. It registers an `afterEach` (per-test —
tightest scope; also covers per-file) that resets **only** the categories the suite proves
leak. Built strictly via TDD: a category gets a reset *only after* its adversarial test
fails without one.

**Hard constraint:** reset MUST NOT re-execute or re-require the RN module graph — that
would defeat the moat. It only mutates *live* singletons back to their boundary defaults
and tears down accumulated subscriptions. Candidate resets (final set decided by the
failing tests):

- Re-seed `Dimensions` / `Appearance` / `AppState` / `I18nManager` / `PixelRatio` to the
  boundary-default constants (call their public setters; do not reload).
- `removeAllListeners()` on the known RN emitter singletons (DeviceEventEmitter, AppState,
  Keyboard, Appearance). Between files this is safe — a fresh file must not depend on a
  prior file's subscriptions.
- Reset the boundary `mockNativeComponent` tag counter (exposed via a small reset export
  from `boundary.mjs`) for deterministic host-tag snapshots.
- Unmount tracked RTR renderers. RNTL v12 already auto-cleans via its own `afterEach`; for
  raw `TestRenderer` tests, provide/encourage a tracked render helper, or document the
  unmount requirement. (Decision deferred to the plan, guided by what category 5 reveals.)

If a category proves **genuinely un-resettable** without graph re-exec (e.g. a value
captured at import time), the fallback is to document it and, if material, allow that
specific test file to opt into `isolate: true` — but the goal is zero such cases for the
core surface.

### 4.3 LogBox fix

Call `LogBox.ignoreAllLogs()` from the native setup file (`src/native/setup.mjs`), using
RN's **public** API. The evidence doc notes a blunt `LogBoxData` boundary mock breaks
Modal/RNTL, so we do not mock the module — we suppress via the supported runtime call. If
the `LogBoxStateSubscription` act() warning still surfaces from a path `ignoreAllLogs`
doesn't cover, contain it via the public API (no internal patching). Verify Modal + RNTL
still render after the change.

### 4.4 Documentation reconciliation

Once the suite is green, update `docs/engine-comparison-evidence.md` §4 table note and §6
item 2 so `isolate:false` is described as **enforced-isolated (CI-gated)**, not flaky.
Update the cache-race line if needed. Keep the honest tone of the doc.

## 5. Components & interfaces

- `src/native/reset.mjs` — exports `installResetHooks()` (registers `afterEach`) and pure
  helpers (`resetSingletons()`, `resetEmitters()`, `resetBoundaryState()`). Imported by
  `setup.mjs`. Stateless across workers; safe to call repeatedly.
- `src/native/boundary.mjs` — add a `resetBoundaryState()` export (e.g. reset the tag
  counter) so reset can reach boundary-owned mutable state without reaching into internals.
- `src/native/setup.mjs` — additionally `installResetHooks()` and `LogBox.ignoreAllLogs()`.
- `tests-native/isolation/*` — the adversarial suite.
- `tests-native/vitest.config.mts` — ensure `sequence: { shuffle: true }` for the isolation
  run (or a dedicated config) without weakening the main native run.

Each unit stays small and single-purpose: the suite *defines* isolation, `reset.mjs`
*enforces* it, `boundary.mjs` *exposes* its own resettable state.

## 6. Testing strategy

- **Primary:** the §3 adversarial suite, run under shuffled `isolate:false` across 3 seeds
  in CI (`test:native`).
- **Regression:** the existing 39 native tests stay green; the mock engine remains
  `isolate:true` and is untouched (re-run its ~1,164 tests).
- **Determinism:** run the isolation suite N× locally to confirm no flakiness.
- TDD throughout: each reset is introduced only to make a specific failing isolation test
  pass — no speculative reset code.

## 7. Risks & open questions

- **Un-resettable state** captured at import time → surfaced by the suite; fallback is
  per-file `isolate:true` opt-in for that case (goal: none on the core surface).
- **RTR mounted-tree cleanup** for raw `TestRenderer` (non-RNTL) tests — exact mechanism
  decided in the plan (tracked-renderer helper vs documented unmount).
- **pool:threads vs forks** — confirm `afterEach` reset runs in the worker scope that holds
  the shared graph; verify with the suite under the shipped pool config.
- **LogBox** — confirm `ignoreAllLogs()` removes the act() warning without breaking
  Modal/RNTL; if not, find the public containment point.
- **Windows** — reset logic is JS-level (no paths), so low risk, but include in the matrix
  later.

## 8. Non-goals (other roadmap specs)

- Real `auto` / per-glob engine selection (next spec).
- Replacing the hand-written boundary with a shim over `react-native/jest/mocks/*`.
- RNTL v14 / `universal-test-renderer` migration.
- RN version matrix (0.78 / 0.82 / 0.84) in CI.
- Third-party library breadth (reanimated / navigation / gesture-handler).
- Merge / release / user-facing docs.

## 9. Success criteria

1. The adversarial isolation suite is green under shuffled `isolate:false` + `pool:threads`
   across 3 seeds, in CI.
2. No per-file reset re-executes the RN graph (the warm-speed benchmark in `bench/` is
   unchanged within noise).
3. The LogBox act() warning no longer appears in the native suite; Modal + RNTL still work.
4. `docs/engine-comparison-evidence.md` no longer contradicts itself; `isolate:false` is
   documented as CI-enforced-isolated.
5. Existing 39 native tests and the full mock suite remain green.
