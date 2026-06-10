# Hot worker runtime with surgical per-file reset — design (2026-06-09)

P0 from [2026-06-09-technical-direction.md](./2026-06-09-technical-direction.md).

**Goal:** `engine: 'native'` runs with N persistent workers where React Native's module
graph loads ONCE per worker and stays resident, while every test file still gets full
per-file isolation. This makes "real RN fidelity, faster than jest, and safe" true —
the thing jest structurally cannot do, because jest's per-file module registry is
foundational to it.

**Status quo being fixed:** the safe config (`isolate: true`, today's default per
`src/native/apply.ts`) spawns a fresh worker per file → RN reloads per file → jest-
equivalent cost (measured ~2× total on a 5-file suite, `pool.mjs` spike). The fast
config (`isolate: false`) leaks state across files sharing a worker (bench/leak: 8/10
fail — both user-module singletons and RN's own `DeviceEventEmitter`).

---

## 1. Verified mechanics (vitest@4.0.18 source, read 2026-06-09)

These are the ground-truth facts the design rests on. All from installed dist code, not
docs. Public surface used: `vitest/worker` (`init`, `runBaseTests`, `setupEnvironment`)
and `vitest/node` (`ThreadsPoolWorker`), both `@experimental`.

**F1 — Worker persistence is decided by the scheduler, keyed on `task.isolate`.**
In `Pool` (cli-api chunk): `task.isolate === false` → look up a compatible runner in
`sharedRunners` and reuse it; `task.isolate === true` → never shared
(`isEqualRunner` throws "Isolated tasks should not share runners") → fresh worker per
file. `worker.canReuse(task)` is consulted **only** on the shared (`isolate: false`)
path — this explains why the earlier `pool.mjs` spike saw `canReuse` never called under
`isolate: true`; the old spike comments in `pool.mjs` are wrong and the file is
superseded by this design.

**F2 — The per-file reset lives INSIDE the worker, and it's exactly the reset we want.**
`run()` in vitest's base worker chunk, per file:

```js
if (config.isolate) {
  moduleRunner.mocker.reset();
  resetModules(workerState.evaluatedModules, true);
}
...
vi.resetConfig();        // always, per file
vi.restoreAllMocks();    // always, per file
```

`resetModules` clears only the Vite module-runner graph (`idToModuleMap`), skipping
vitest's own dist. **Externalized modules — RN, in the worker's Node `require` cache —
are untouched.** So vitest's own reset already implements "fresh user modules, resident
RN"; it just never runs in a persistent worker because of F1.

**F3 — Worker-level module caches persist across run messages.** The base chunk keeps
module-scope `evaluatedModules`, `moduleExecutionInfo`, and a memoized module runner;
`runBaseTests` reattaches them to each incoming state and honors `ctx.invalidates`
(watch-mode invalidation) plus always invalidates the incoming test files themselves.
Hot workers and watch mode compose for free.

**F4 — The worker entry is trivially replaceable.** Stock `dist/workers/threads.js` is:

```js
workerInit({ runTests: runBaseTests, setup: setupEnvironment })
```

where `workerInit` wires `parentPort` post/on/off into `init()`. `init`,
`runBaseTests`, `setupEnvironment` are all exported from `vitest/worker`.
`ThreadsPoolWorker` resolves `this.entrypoint = resolve(options.distPath,
'workers/threads.js')` in its constructor — and vitest's own `VmThreadsPoolWorker`
demonstrates the extension pattern we'll use: subclass, override `entrypoint` (+
`canReuse`, `reportMemory`).

**F5 — Custom pools plug in via config.** `pool` accepts a `PoolRunnerInitializer`
`{ name, createPoolWorker(options) }` (stored as `config.poolRunner`); the scheduler
matches it when `task.worker === name` and calls `createPoolWorker(options)` per new
runner.

**F6 — Only two worker-side consumers of `config.isolate`:** the F2 reset loop, and
`startCoverageInsideWorker` / `stopCoverageInsideWorker` (passed `{ isolate }`).
Nothing else keys on it inside the worker runtime.

---

## 2. The keystone

> **Schedule like `isolate: false`, reset like `isolate: true`.**

Pool-level `isolate: false` keeps N workers persistent (F1). Our custom worker entry
flips `state.ctx.config.isolate = true` before delegating to `runBaseTests`, so
vitest's **own** per-file reset (F2) runs inside the persistent worker. RN stays hot in
the Node require cache; user modules, mocks, and vi config reset per file using
vitest's blessed code path — we re-point where isolation happens rather than
reimplementing it.

What vitest's reset does NOT cover (proven by bench/leak Class B) is state inside the
resident, externalized RN graph and globals — that is the **surgical reset manifest**
we add (§3.3).

## 3. Architecture

Four small pieces, all in `src/native/` (shipped verbatim to `dist/native/` like the
other `.mjs` runtime files).

### 3.1 Pool: `src/native/pool.mjs` (rewrite of the spike file)

```js
import { ThreadsPoolWorker } from "vitest/node";

class NativePoolWorker extends ThreadsPoolWorker {
  name = "vitest-native";
  constructor(options, poolOptions) {
    super(options);
    this.entrypoint = NATIVE_WORKER_ENTRY; // our dist/native/worker.mjs
    this.recycleAfterFiles = poolOptions.recycleAfterFiles ?? 0; // 0 = never
    this.tasksRun = 0;
  }
  canReuse(task) {
    this.tasksRun++;
    if (this.recycleAfterFiles && this.tasksRun >= this.recycleAfterFiles) return false;
    return isEnvironmentEqual(task);  // preserve stock environment check
  }
}

export function nativePool(poolOptions = {}) {
  return { name: "vitest-native", createPoolWorker: (o) => new NativePoolWorker(o, poolOptions) };
}
```

- `canReuse` is live on this path (F1) → it becomes the **recycling policy hook**
  (worker-leak self-defense, jest's `workerIdleMemoryLimit` analogue). v1: recycle
  after N files. v2: RSS-based via `reportMemory` (see Open questions).
- Forks variant (`ForksPoolWorker`) deferred until someone needs process isolation.

### 3.2 Worker entry: `src/native/worker.mjs` (new)

Mirrors stock `workers/threads.js` (F4), with three additions at boot and one per
message:

```js
import { init, runBaseTests, setupEnvironment } from "vitest/worker";
import { parentPort } from "node:worker_threads";
import { installRequireHooks } from "./hooks.mjs";   // existing
import { prepareReset, surgicalResetRegistry } from "./reset.mjs"; // new

// Boot (once per worker):
// 1. install require hooks + boundary mocks (existing hooks.mjs — already
//    idempotent/worker-global; config arrives via env: VITEST_NATIVE_* like today)
// 2. preload RN: createRequire(...)("react-native") → graph resident before file 1
// 3. capture globalThis baseline (own keys + descriptors) for the per-file diff

init({
  post: (m) => parentPort.postMessage(m),
  on: (cb) => parentPort.on("message", cb),
  off: (cb) => parentPort.off("message", cb),
  teardown: () => parentPort.removeAllListeners("message"),
  runTests: (state, traces) => {
    state.ctx.config.isolate = true;        // the keystone (§2)
    return runBaseTests("run", state, traces);
  },
  collectTests: (state, traces) => {
    state.ctx.config.isolate = true;
    return runBaseTests("collect", state, traces);
  },
  setup: setupEnvironment,
});
```

### 3.3 Surgical reset manifest: `src/native/reset.mjs` (new)

Covers exactly what F2 doesn't: state in the resident RN graph + globals. Runs per
file via the custom runner (§3.4).

- **(a) Boundary mock state.** We own every boundary mock (`boundary.mjs`). Each
  stateful one registers a reset callback in a worker-global registry
  (`globalThis.__vitest_native_resets`). Reset = run all callbacks.
- **(b) Resident RN JS singletons.** Manifest of known stateful modules in RN's own JS,
  reset via public API where possible, feature-detected per RN version (CI matrix
  0.81–0.84 keeps this honest): `DeviceEventEmitter.removeAllListeners()`, AppState /
  Appearance / Dimensions listener registries, `InteractionManager` queue. Grow the
  manifest empirically — bench/leak and the stress suite are the detectors, mirroring
  how the cross-check corpus grows.
- **(c) globalThis delta.** Diff own keys + descriptors against the post-preload boot
  baseline: delete added keys, restore changed ones. Skip-list: `__coverage__`, vitest
  injections (`__vitest_*`), `console`, `IS_REACT_ACT_ENVIRONMENT` (managed by setup).
- **(d) Pending async (policy, not force-cleanup, in v1).** vitest already restores
  mocks/timers config per file; real timers/handles left by a test are detected and
  attributed with a loud warning naming the offending file (silent leakage is the
  failure mode we exist to prevent — see silent-failure principle in bench/leak).

### 3.4 Per-file hook point: custom runner `src/native/runner.mjs` (new)

`run()` calls `startTests([file], runner)` once per file (F2), so a runner subclassing
`VitestTestRunner` (from `vitest/runners`) gets per-file `onBeforeRunFiles` /
`onAfterRunFiles` — the vitest-blessed per-file hook. `onAfterRunFiles` →
`surgicalReset()` (§3.3); also unmount any RNTL screens (`cleanup()`) before resetting.
Wired via `test.runner` in `nativeEngineConfig` (composes with existing config; if a
consumer sets their own runner, document the conflict and expose our reset as a
callable).

### 3.5 Config: `src/native/apply.ts`

Behind an opt-in flag first — `reactNative({ engine: 'native', hotRuntime: true })`:

```ts
test: {
  pool: nativePool(opts.poolOptions),
  isolate: false,          // scheduler-level: keep workers persistent (F1)
  runner: NATIVE_RUNNER,   // per-file surgical reset (§3.4)
}
```

`hotRuntime: false` (default until M4 gates pass) keeps today's safe `isolate: true`
behavior. After the gates: flip the default, keep the escape hatch.

## 4. Milestones & gates

The leak harness is the spine: `bench/leak/gen.mjs N` generates an ordered corpus where
file k asserts both state classes start clean, then dirties them. Single worker +
fixed order = the adversarial case. jest baseline: 10/10.

- **M0 — Scaffold (pool + worker entry, NO reset manifest). ✅ DONE 2026-06-09.**
  Predicted split confirmed exactly: Class A passed 5/5 (vitest's F2 reset running
  hot), Class B failed b–e; ONE worker boot for 5 files; 200ms vs 719ms (today's safe
  default). Bonus: full tests-native suite 84/84 green under hot, unchanged.
- **M1 — Reset manifest. ✅ DONE 2026-06-10.** `reset.mjs` covers: (1) RN listener
  tracking via one wrapped RCTDeviceEventEmitter.addListener (NativeEventEmitter
  delegates there, so AppState/Appearance/Keyboard are covered; RN core modules are
  pre-touched at boot so their internal listeners predate tracking and survive);
  (2) Dimensions restore from boot snapshot; (3) explicit RNTL cleanup() (RNTL is
  resident, its auto-cleanup only registers in file 1); (4) the
  `globalThis.__vitest_native_resets` callback registry (no stateful boundary mocks
  today — extension point); (5) globals diff vs lazy baseline captured at file 1's
  setup-top (after vitest injects per-batch globals; mutation-restore deferred).
  Trigger = first statement of setup.mjs — safe because Vitest FORCE-INLINES setup
  files (`inlineFiles` in the externalizer), so the body re-runs per file even in
  consumer installs where the rest of the package is externalized; helper modules use
  globalThis guards since they can be evaluated through both Node and the module
  runner. Generator grew Class C (globalThis) + Class D (Dimensions.set).
  **Results: 20/20 @ 5 files; 200/200 @ 50 files, ONE worker, 364ms — vs 7.18s
  (native isolate:true, ~20×) and 746ms (jest single-worker, best case) on the same
  corpus. (Micro-corpus numbers; honest claims wait for M4.)** All regression gates
  green: native stock 84, native hot 84, mock 1229, crosscheck 43/43,
  typecheck/lint/format.
- **M2 — Real suites. ✅ DONE 2026-06-10.** obytes: 40/40 under hot (also fixed a
  stock regression found by the rerun: preset virtual modules exported the namespace
  object as `default` — obytes' `import Svg from 'react-native-svg'` got an object;
  both codegen sites now honor a factory-provided default). Rocket.Chat (vitest
  4.1.8 — also validates the experimental API across 4.x): **574 passed / 47 failed
  = EXACT stock parity (file-level diff: 0 regressed, 0 flipped) at 4.77s vs 11.72s
  stock (2.5×)**. Three reset-model upgrades came out of the RC regressions:
  1. **Vitest-level state resets** (setup.mjs, hot only): `vi.useRealTimers()` +
     `vi.unstubAllGlobals()` + `vi.unstubAllEnvs()` — fake timers from a previous
     file otherwise break all later rendering ("Can't access .root on unmounted
     test renderer" = the tree rendered EMPTY because act couldn't flush).
  2. **Import-phase/test-phase attribution** (the big one): resident externalized
     libs lazily create globals at IMPORT time exactly once (deleting Storybook's
     `__STORYBOOK_ADDONS_PREVIEW` made every later story render empty). The custom
     runner (runner.mjs, `test.runner`) calls `bless()` from `onBeforeRunFiles` —
     after collectTests imported everything, before the first test. Blessed state
     (globals, RN listeners, process.env snapshot) joins the baseline; only
     test-phase additions are reset. If bless never fires (consumer overrode
     `runner`), attribution-dependent teardowns disarm (fail-open).
  3. **No cross-context RNTL cleanup**: loading RNTL via Node `require` from the
     reset created a second instance that corrupted rendering when the consumer
     graph inlines RNTL; importing it from setup shifted evaluation order and also
     broke. Resident-RNTL tree accumulation is accepted (memory-bounded by worker
     recycling, not a correctness leak) and documented in setup.mjs.
  All gates re-verified after the changes: leak-hot 20/20 @5 + 200/200 @50 (one
  worker, 421ms), native stock 84, native hot 84, mock 1229, crosscheck 43/43.
- **M3 — Robustness. ✅ DONE 2026-06-10.** All contracts verified against running
  code, not assumption:
  - **Recycling** (`hotRuntime: { recycleAfterFiles, memoryLimit }`): the Pool stops
    a `canReuse → false` runner immediately (verified in source — no idle-thread
    leak) and creates a fresh one. Verified live: 3 boots @ recycleAfterFiles=2 vs 2
    without; memoryLimit=1B → retire after every file (5 boots), all tests green.
    Memory policy rides Vitest's own `reportMemory` → `usedMemory` (heapUsed) rails;
    Vitest's config-level memoryLimit is hardcoded to vm pools (RFC item). Caveat:
    with `isolate:false && maxWorkers===1` Vitest batches ALL files into ONE task
    (groupSpecs optimization), so recycling is inert in single-worker mode —
    documented, not fought.
  - **Coverage (F6) closed**: v8 coverage on obytes src/** (80 files) is IDENTICAL
    stock vs hot — 0 differing files, totals equal. The only divergence anywhere is
    this plugin's own dist/native/*.mjs (run once at boot under hot), which are
    node_modules-excluded by default in consumer installs.
  - **Watch mode**: rerun is module-graph selective (only the edited file reran).
    Each watch ITERATION boots a fresh worker — the Pool stops shared runners when
    the queue empties at end-of-run; `canReuse` is never consulted with an empty
    queue. Same as stock isolate:false; keeping a thread alive past stop() would
    betray the pool contract, so this is a documented per-rerun cost (~one RN boot)
    and the second upstream RFC item (persist shared runners across watch reruns).
  - **Crash (`process.exit` in a test)**: intercepted by Vitest; failing file
    reported, all other files in the batch complete — parity with stock.
  - **Unhandled late rejections**: parity with stock (same reporting behavior).
  - **Snapshots across files in one worker**: covered empirically by Rocket.Chat's
    Story Snapshots at exact parity in M2.
- **M4 — Benchmark protocol → claims. ✅ DONE 2026-06-10.** Harness +
  RNTL-component corpus under `bench/scale/` (`gen.mjs`, `run.mjs`, 4 configs);
  raw artifact `bench/scale/results.json`; full write-up + sanctioned claims in
  [2026-06-10-M4-benchmark-results.md](./2026-06-10-M4-benchmark-results.md).
  Headline (Apple M5, 200 files): **native hot beats jest 4.66× @1 worker, 3.02×
  @8 workers**, marginal **5.4/2.6 ms/file** vs jest's **36/14.5**. Key honest
  findings: native stock isolate:true is the SLOWEST (225 ms/file — the per-file
  RN-reload tax the hot runtime removes, 40× gap to hot @1w); the **mock engine is
  slower than jest at scale** (124 ms/file — it also runs isolate:true, so mock is
  NOT "the fast one"); hot's win scales with files≫workers; hot RSS ≤ jest
  (2.7 vs 4.6 GB @8w). Fixed a real bug building it: jest's scale config needs
  `rootDir`=bench so `babel.config.cjs` strips Flow from RN's `jest/setup.js`.
- **M5 — Upstream write-up.** Document the pattern ("reusable workers with per-file
  module isolation") and open a Vitest discussion/RFC; our implementation is a
  real-world consumer of their experimental pool/worker API and the pattern is a
  plausible first-class `isolate: 'modules'` mode.

## 5. Risks & open questions

- **`config.isolate` flip vs coverage (F6).** Coverage start/stop receives the flipped
  value worker-side while the node side believes `isolate: false`. Verify v8 + istanbul
  coverage correctness in M3; if wrong, scope the flip to exclude the coverage calls
  (wrap `runBaseTests` args) rather than abandoning the keystone.
- **Experimental API churn.** `vitest/worker`, `poolRunner`, `ThreadsPoolWorker` are
  `@experimental` in v4. Mitigation: pin minimum vitest, CI canary on `vitest@latest`,
  keep our usage thin (≈150 LOC across pool + worker entry), upstream the pattern (M5).
- **Non-reused runner teardown.** When `canReuse` returns false, confirm the scheduler
  stops the old runner (no thread leak). Verify in M3 with the recycling test.
- **Reset manifest completeness.** Unknown-unknowns in RN's stateful surface. Strategy:
  the manifest grows from detectors (bench/leak classes, stress suite, bake-off
  flakes), same epistemics as the cross-check corpus; any detected-but-unresettable
  state → loud error recommending `hotRuntime: false`, never silent.
- **Snapshot state across files.** Verify snapshot client correctness with multiple
  files per worker (stock `isolate:false` users exercise this path already, so low
  risk; confirm in M2).
- **Unhandled rejections crossing file boundaries** in a persistent worker get
  misattributed. Detect in `onAfterRunFiles`, attribute to the just-finished file.
- **RSS-based recycling** needs node-side memory reporting (`reportMemory` on the
  worker, as vmThreads does). Investigate what the scheduler does with it in v4; if
  usable, add `memoryLimit` to pool options in M3, else ship files-count recycling only.

## 6. What this is NOT

- Not a reimplementation of vitest isolation — we run vitest's own reset in a worker
  vitest already knows how to keep alive; the only novel runtime code is the RN reset
  manifest, which only we can write because we own the boundary.
- Not a jest-style VM-context sandbox (vmThreads): RN's graph actively fights VM
  sandboxing, and the leak harness gives us empirical (not theoretical) safety.
- Not a default-on change until M4 gates pass. `hotRuntime: true` is the opt-in;
  today's safe behavior remains the default until the numbers and the bake-offs say
  otherwise.
