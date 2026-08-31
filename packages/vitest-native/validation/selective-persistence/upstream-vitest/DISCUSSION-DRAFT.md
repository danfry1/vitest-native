# Module isolation inside a reused Node worker

**Draft only. Nothing has been posted upstream.**

Vitest currently provides two ends of a useful spectrum:

- `isolate: true`: replace the worker/realm for each test file;
- `isolate: false`: reuse the worker and all evaluated user modules.

Would Vitest be open to a middle Node mode that reuses the worker realm but resets
Vitest mocks and evaluated Vite modules before every test file?

```ts
export default defineConfig({
  test: {
    isolate: "modules",
  },
});
```

The name is provisional. The important contract is worker reuse plus full per-file
Vite module/mock reset—not selective persistence.

## Why this is useful

Some integrations have expensive process/realm initialization or deliberately
external CommonJS runtimes, but their application modules and mocks still require
normal file boundaries. Today an integration must choose between replacing the
worker for every file or use `isolate: false` and privately reset Vitest's evaluated
module graph.

React Native exposed the use case, but the primitive is package-independent. In our
integration, React Native and deliberately native-transformed third-party packages
remain external because their CommonJS/Metro source path must have one owner. Vitest
should own and reset tests, application modules and virtual facades without also
recreating the worker.

## Proposed semantics

For initial Node `threads` and `forks` support:

1. reuse the worker process/thread and JavaScript realm;
2. before each file, reset the mock registry and all evaluated Vite modules using
   Vitest's existing reset behavior;
3. keep each file as a separate scheduler task, including with one worker, so pool
   policy can recycle the worker between files;
4. preserve normal external Node module semantics (`require.cache` is outside this
   primitive);
5. preserve coverage attribution at file boundaries.

This is not full realm isolation. Fake timers, stubbed globals, environment changes,
listeners and arbitrary external singletons can survive until setup/integration code
restores them or the worker is recycled. The proposed documentation and tests make
that distinction explicit.

## Source prototype

A patch against Vitest commit
`1c00c94686ff6f96ec756503ed765b31068692a8` (`5.0.0-rc.2`) implements the behavior at
the existing per-file lifecycle seam:

```ts
if (config.isolate || config.moduleIsolation) {
  moduleRunner.mocker?.reset()
  resetModules(workerState.evaluatedModules, true)
}
```

Configuration normalizes `isolate: "modules"` into an internal boolean while keeping
the existing resolved `isolate` boolean false for realm scheduling. The one-worker
grouping condition does not batch module-isolated files, preserving recyclable task
boundaries.

The patch adds no selective graph traversal and does not expose Vite module nodes to
runner authors.

## Evidence

The clean source checkout passes:

- Vitest build;
- repository root typecheck;
- `pnpm lint:fix` and `git diff --check`;
- CLI parsing for `--isolate`, `--isolate=modules` and `--no-isolate` (31/31 unit
  tests);
- a new 10/10 end-to-end suite with no type errors;
- 31/31 focused V8, Istanbul, native and custom-provider coverage tests.

The end-to-end suite covers:

- threads and forks;
- fresh Vite module and mock state with stable worker identity;
- two workers;
- explicit fake-timer/global leakage and setup-file restoration;
- two projects with separate external identities;
- query-string module ids;
- an unresolved dynamic import that must not stall the file boundary;
- mocking across the external Node/Vite ownership boundary;
- a custom stock-worker subclass that refuses reuse after each file, proving
  one-worker tasks remain recyclable.

The implementation also passed packed real-world experiments:

- React Native 0.87: 9 files / 11 tests on a stock worker with no private module-node
  reset;
- two projects using RN 0.81.5 and 0.87.0 in one invocation: 4/4;
- the same two-version fixture on the current production hot pool: 4/4, including a
  realm-identity assertion that would fail if the projects shared their external RN;
- RN 0.87 + RNTL 14 + React Navigation: 136/136 files in 1.808 seconds, compared with
  1.577 seconds for the current specialized runtime and 18.54 seconds for full
isolation;
- the fully shared negative control passed only 104/136 files.

A separate packed 40-file V8 gate compared the complete normalized
`coverage-final.json` map and counters between ordinary isolation and the current
reused-worker hot lifecycle. They were exactly equal, including a deliberately
uncalled function remaining at zero. The upstream patch's own coverage matrix is the
direct evidence for the proposed mode; this packed gate shows the same lifecycle
contract remains meaningful in the RN integration that would consume it.

In a package-free 500-file, one-worker benchmark, full isolation took 25.926 seconds,
module isolation 0.889 seconds and fully shared execution 0.819 seconds. The point is
not the portable speedup; it is that module reset tracks shared execution closely
while retaining a contract the shared negative controls fail.

## Questions for maintainers

1. Does this semantic mode belong in core?
2. Does `isolate: "modules"` fit Vitest's vocabulary, or would a separate option be
   clearer?
3. Is limiting v1 to Node threads/forks the right scope?
4. Should one-worker non-isolated batching be explicitly modeled as a scheduler
   policy so integrations can retain per-file resource boundaries?
5. Is there a preferred public pool mechanism for memory-based worker recycling and
   admission beyond `ThreadsPoolWorker.canReuse()`?

If the direction fits, the attached prototype can be rebased and converted into a
focused PR using the agreed API shape.

## Possible later increment: persistent actuals

We separately proved that retaining a selected Vite actual requires retaining its
entire successfully evaluated dependency closure; retaining only the matched node
creates simultaneous dependency identities. That capability may be useful for other
runtimes, but it adds query/virtual-id, mocking, promise-state and closure semantics.

It is intentionally not part of this v1 request. The full-reset mode is independently
useful, substantially smaller and sufficient for our production architecture.
