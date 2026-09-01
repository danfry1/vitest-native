# Vitest module-isolation architecture experiment

**Status:** validated prototype; not production code
**Date:** 2026-08-30
**Vitest base:** `1c00c94686ff6f96ec756503ed765b31068692a8`
(`5.0.0-rc.2`)

## Question

Can Vitest reuse a normal Node worker while resetting its Vite module graph and mock
registry before every file, leaving React Native in its native CommonJS owner, and
still provide correct file boundaries, coverage, project isolation, recycling and a
large performance win?

The answer from this experiment is **yes** for Node `threads` and `forks`.

This is the smallest upstream primitive the production hot engine needs. It does not
require persistent Vitest modules, a `preserveActual` list or moving React Native into
Vite's graph.

## Prototype API and implementation

```ts
export default defineConfig({
  test: {
    isolate: "modules",
  },
});
```

The mode means:

- reuse the worker process/thread and JavaScript realm;
- reset Vitest's mock registry before every file;
- reset evaluated Vite modules before every file;
- keep files as separate scheduler tasks, including at one worker, so the pool can
  recycle between them;
- do not promise to restore timers, globals, environment variables, listeners or
  external Node `require.cache` entries.

The retained source diff is [vitest-module-isolation.patch](./vitest-module-isolation.patch).
Its runtime reset is the existing `runBaseTests` lifecycle seam. The remaining source
changes normalize and serialize the mode and stop the one-worker scheduler from
batching all files into an unrecyclable task.

## Upstream source gates

All of these passed in a clean Vitest checkout after the package was rebuilt:

| Gate | Result |
| --- | ---: |
| `pnpm lint:fix` | pass |
| `pnpm typecheck` | pass |
| `pnpm --filter vitest build` | pass |
| CLI option unit suite | 31/31 |
| module-isolation end-to-end suite | 10/10, no type errors |
| V8/Istanbul/native/custom coverage matrix | 31/31 |
| `git diff --check` | pass |

The end-to-end suite covers:

- worker identity reuse with fresh Vite modules and mocks in both threads and forks;
- two workers;
- explicit shared-realm leakage for fake timers and stubbed globals;
- restoration of that realm state by a setup file;
- two projects with separate external Node identities;
- query-string module ids;
- a pending dynamic import that must not stall the reset boundary;
- the Node/Vite mock ownership boundary;
- one-worker recycling using a normal `ThreadsPoolWorker` subclass.

The root typecheck initially found two integration defects that the focused prototype
did not: the CLI still treated `isolate` as boolean-only, and resolved config typing
discarded the union before normalization. Both are fixed and covered by the retained
patch.

## Generic performance

Generated one-worker suite, 500 files, warm observation:

| Mode | Duration | Meaning |
| --- | ---: | --- |
| full isolation | 25.926 s | new worker per file |
| module isolation | 0.889 s | reused realm, fresh Vite modules/mocks |
| fully shared | 0.819 s | reused realm and modules |

Module isolation was about 29x faster than worker replacement and about 9% behind
unsafe fully shared execution. Preserving per-file scheduler tasks did not materially
change the earlier batched result (`0.862 s`).

This benchmark demonstrates that the reset primitive is cheap. It is not a React
Native marketing benchmark.

## Real React Native gates

All consumer gates used packed packages rather than workspace resolution.

### Hot-shaped smoke gate

Real React Native 0.87 ran through stock Vitest threads with module isolation, the
normal native setup and a small runner that only installs the Node-owned RN runtime.
There was no custom worker and no private Vite module-node mutation.

Result: **9 files / 11 tests passed in 163 ms**.

### Two-project version gate

Two projects in one Vitest invocation installed and executed different React Native
versions (`0.81.5` and `0.87.0`). Each project observed its own RN version and
platform constants. The same retained fixture now has two modes:

- patched stock Vitest with `isolate: "modules"`: **4/4**;
- the current production hot pool on Vitest 4.1.10: **4/4 in 388 ms**.

The hot run also stores the first project's `Platform` object on `globalThis`. If a
worker realm or environment were reused across projects, the second project's
different object would fail the identity assertion. It did not: the projects had
distinct realms as well as distinct package resolution.

This proves project-scoped external identities for separate installs. The transformer
already follows that rule; registry, ownership and runtime state must follow the same
project-context pattern rather than introducing new process globals.

### Dynamic Expo Router root gate

A packed Expo 56 / RN 0.85.3 consumer computes the file-system route root at runtime:

```ts
const routeRoot = ["./", "app"].join("");
renderRouter(routeRoot, { initialUrl: "/details/17" });
```

The real Expo Router testing library discovered and rendered the route successfully:
**1 file / 3 tests passed in 685 ms**. This proves the literal-root limitation
belonged to the discarded source-regex capsule rewrite, not the Node-owned production
architecture.

### RNTL-heavy correctness gate

Packed RN 0.87 + RNTL 14 + React Navigation suite:

| Mode | Files passed | Representative duration | Peak process-tree RSS |
| --- | ---: | ---: | ---: |
| full isolation | 136/136 | 18.54 s | 513 MiB |
| module isolation | 136/136 | 1.808 s | 468 MiB |
| production hot | 136/136 | 1.577 s | 443 MiB |
| fully shared negative control | 104/136 | n/a | n/a |

The failing shared control proves the cross-file assertions are discriminating.
Module isolation is close to production hot without replacing RN's CommonJS owner.

### Packed coverage parity gate

A packed RN 0.87 / Vitest 4.1.10 fixture ran 40 files through V8 coverage under
default isolation and the production hot pool. Every file first asserted that its
Vite-owned source module had fresh state, then exercised one of three complementary
branches. The subject also contained a deliberately uncalled function.

Both modes passed 40/40. Their complete `coverage-final.json` maps and counters were
byte-for-byte equivalent after removing the absolute file path; the uncalled function
remained at zero. Representative duration was 2.32 s default and 365 ms hot.

This closes the concern that coverage's serialized `isolate:false` setting necessarily
causes duplicate attribution under the current hot lifecycle. Istanbul and custom
providers remain covered by the focused upstream suite; packed scale is currently V8.

## Memory result

After forcing GC in a deterministically last test file, module isolation and current
hot have the same resident growth shape:

| Total files | Module isolation heap | Current hot heap |
| ---: | ---: | ---: |
| 46 | 57 MiB | 56 MiB |
| 136 | 123 MiB | 121 MiB |
| 406 | 320 MiB | 315 MiB |

The growth is therefore not evidence against Vitest module reset. It is retained
React Native/RNTL/test-renderer state in the shared realm/Node graph. Recycling is a
required architectural boundary for both runtimes.

At 406 files:

| Mode | Duration | Peak RSS | Final worker heap | Recycles |
| --- | ---: | ---: | ---: | ---: |
| unrecycled hot | 5.296 s | 733 MiB | 315 MiB | 0 |
| module isolation, 96 MiB threshold | 7.029 s | 679 MiB | 54 MiB | 8 |

Vitest currently begins worker replacement without waiting for the old worker to
terminate. The total budget must reserve old/new overlap; a recycle threshold cannot
equal the process or cgroup hard limit.

### Worker-count curve

Same 406-file suite, module isolation, 96 MiB worker-heap threshold:

| Workers | Duration | Peak RSS |
| ---: | ---: | ---: |
| 1 | 4.879 s | 429 MiB |
| 2 | 2.953 s | 652 MiB |
| 4 | 2.149 s | 988 MiB |
| 8 | 2.033 s | 1,499 MiB |

Eight workers bought roughly 6% over four for about 512 MiB more peak RSS. The
candidate automatic ceiling is therefore four. Higher concurrency remains an
explicit or measured choice.

`memory-budget.mjs` earned the policy now implemented by
`src/native/memory.mjs` and the production hot pool:

- an effective limit from host and constrained memory;
- 80% soft and 90% hard RSS limits;
- a 256 MiB main-process reserve;
- a 192 MiB replacement-overlap reserve;
- at most four automatic workers;
- a 96–512 MiB per-worker heap threshold.

`memory-accounting.mjs` verifies Node's accounting model: worker `heapUsed` is local
to each thread, while every thread reports the same process-wide `rss`. A threads
pool can therefore report local heap to the scheduler and sample process RSS once.
Fork pools need process-tree or cgroup accounting.

The runtime-input probe was also run in real Docker cgroup v2 containers using the
minimum supported Node line (`v20.20.2`). `process.constrainedMemory()` exactly matched
512 MiB, 1 GiB and 2 GiB hard limits even though `os.totalmem()` reported the 11.7 GiB
Linux VM host. The candidate planner selected the constraint in every case and kept
its hard RSS threshold below it:

| cgroup | automatic workers | worker heap threshold |
| ---: | ---: | ---: |
| 512 MiB | 1 | 96 MiB |
| 1 GiB | 1 | 241 MiB |
| 2 GiB | 4 | 193 MiB |

This establishes that Node's supported API is a viable cross-cgroup input and that
`os.totalmem()` alone is unsafe. The production planner now consumes it, performs
admission before registry compilation and fails closed when only current Vitest's
unrecyclable one-worker mode fits.

The packed production gate then installed RN 0.87, RNTL 14, React Navigation and the
packed package in a Node 22 Linux container and ran the 405-file scale fixture. At
512 MiB and 1 GiB it exited during config with `HOT_MEMORY_UNBOUNDED`, before registry
compilation and without exit 137. At 2 GiB it capped an explicit eight-worker request
to four through Vite's real config merge, passed every file and logged worker
recycling at the explicit 96 MiB heap threshold. This proves the current constants
on one real cgroup v2 shape; CI/provider and cgroup v1 coverage remain calibration
work.

## Registry result

The precompiled CommonJS factory registry remains the correct RN representation.
Removing it preserved semantics but was operationally unacceptable at 406 files:

| Mode | Duration | Peak RSS | Recycles |
| --- | ---: | ---: | ---: |
| module isolation + registry | about 5–7 s | 0.68–0.99 GiB | 8 |
| no registry, unrecycled | 28.206 s | 2.25 GiB | 0 |
| no registry, 96 MiB threshold | 29.361 s | 441 MiB | 45 |

The registry keeps compiled RN factories resident while creating fresh RN module
instances through the CommonJS cache policy. It preserves RN's lazy getters, cycles
and synchronous `require()` semantics without pretending RN is ESM.

Cold registry compilation is the main-process memory spike:

- 438 modules, approximately 1.35 MiB artifact, about 1.8–2.2 seconds;
- default V8: after-GC RSS about 454 MiB although used heap was only about 38 MiB;
- child process with `--max-old-space-size=96`: after-GC RSS about 287 MiB;
- 64 MiB also completed; 32 MiB OOMed.

That design is now the production path. `run-registry-process.mjs` rebuilds the real
438-module graph in fresh parent processes and races two real compiler children
against one cold cache. On the implementation run, in-process compilation took
1.82 s and left the long-lived parent at 471 MiB RSS after GC; the child path took
2.04 s and left its parent at 56 MiB. The 1.35 MiB artifact and module count were
identical, a warm manifest lookup took 1.4 ms without a compiler, and the concurrent
builders converged without a partial or temporary file. The gate requires semantic
parity, at least 64 MiB of persistent-parent RSS savings, bounded latency and an
atomically readable concurrent result rather than those machine-specific numbers.

Production performs the cheap parent cache lookup, compiles a miss at a 96 MiB
old-space cap, retries only a recognized V8 heap OOM at 256 MiB, validates the
published manifest in the parent and then lets the child exit before workers start.
The compiler protocol has its own file descriptor, so Babel/plugin stdout cannot
corrupt it. Ordinary failures retain the visible, correctness-preserving per-file
fallback. Registry keys include normalized asset extensions because they change
the emitted graph; the prototype caught that previously missing cache input.

## Inline-all ownership negative control

`inline-all.config.mts` forces Vitest's `server.deps.inline: true` over the native
engine and runs the existing detected-package singleton gate. Before the production
guard was added, the file compiled and three of four tests passed, but the decisive
identity assertion failed:

```text
expected '' to be 'written-through-the-import'
```

The app import had configured Vite's copy while `createRequire()` read Node's copy.
This proves inline-all is not merely a transform preference under the layered
runtime; it defeats the single-owner invariant without throwing. The native plugin
now fails during config with `INLINE_BREAKS_OWNERSHIP`. The config remains as a
durable negative control and documentation of the mutation that earned the guard.

## Linked React Native path gate

A generated project links `node_modules/react-native` to a real directory whose name
is deliberately not `react-native` and whose path is outside every `node_modules`
segment. Its mini RN graph contains Flow syntax, an extensionless internal require
and a native-boundary file whose real body throws.

The ownership policy maps the canonical package root back to semantic RN paths. The
precompiled registry, CommonJS hook and ESM loader all compile the linked dependency
and serve the boundary mock rather than the throwing source. This closes the gap
between merely externalizing a linked package and actually executing it correctly;
path layout is evidence, not ownership policy.

## Architectural conclusion

The supported target is deliberately layered:

1. Vitest/Vite owns tests, application/first-party modules and virtual facades.
2. Node owns React Native's CommonJS runtime, detected Metro-source dependencies and
   other deliberately external modules.
3. The registry is a precompiled factory capsule inside the Node-owned RN runtime,
   not a second Vitest module graph.
4. One project-scoped ownership decision service prevents any request from silently
   acquiring both a Vite and Node identity.
5. Vitest's module-isolation primitive resets the Vite graph and mocks at file
   boundaries; package setup restores shared-realm state; the pool recycles before
   resident Node/RNTL state breaches its budget.

The goal is not “one graph” at all costs. The enforceable invariant is **one
authoritative owner and one live identity for each module within a project**.

Selective persistence remains useful research for other runtimes, but it is not
required for the RN production architecture and should not lead the upstream ask.

## Remaining unknowns

- browser and VM pool semantics are intentionally outside the proposed Vitest v1;
- packed RN V8 and Istanbul coverage have exact default/hot map and execution-count
  parity and run as a canonical Linux CI gate;
- cgroup v2 has packed Linux pass/fail-closed/recycle evidence; cgroup v1 and varied
  CI provider shapes remain;
- supported hot/module mode still needs to stop using private Vitest state before the
  architecture is promoted;
- the core state manifest is ordered, verified and mutation-gated; broader
  RN/RNTL/Expo version coverage remains;
- Metro differential resolution and RN/RNTL/Expo packed matrices remain required.

## Reproduction entry points

- `benchmark.mjs`: generic isolate/modules/shared timing.
- `run-native-hot-shape.mjs`: packed stock-worker RN gate.
- `run-two-rn-projects.mjs`: distinct RN versions in one run. Use the patched Vitest
  checkout by default, or set `VN_TWO_RN_RUNTIME=hot` for the production pool.
- `run-scale.mjs`: packed correctness, RSS, recycling and concurrency matrix.
- `profile-registry.mjs`: cold registry compiler profile.
- `run-registry-process.mjs`: parent/child cold RSS, artifact, warm-cache and
  concurrent-writer production gate.
- `memory-accounting.mjs`: Node thread memory semantics.
- `memory-budget.test.mjs`: evidence table from which the production planner was
  derived.
- `memory-budget-runtime.mjs`: Node 20 constrained-memory input under real cgroups.
- `run-cgroup-hot.mjs`: packed production-hot fail-closed and recycle/survival gate
  at 512 MiB, 1 GiB and 2 GiB Docker limits.
- `run-coverage.mjs`: packed RN exact V8 + Istanbul default/hot coverage parity.

The scale and packed scripts create temporary consumers and install dependencies, so
they are evidence tools rather than routine unit tests.
