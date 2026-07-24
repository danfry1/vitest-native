---
"vitest-native": patch
---

Remove the hot runtime's last dependency on Vitest's internal worker state

The hot runtime re-enabled Vitest's per-file isolation by mutating
`state.ctx.config.isolate` inside the worker — a shape nothing contracts. It now
performs the two operations that flag was buying (`mocker.reset()` and a clear of the
evaluated module graph) directly, through public API: the `onModuleRunner` hook of
`vitest/worker`'s `init()`, and Vite's `ModuleRunner.clearCache()`.

Separately, `hotRuntime` now refuses to start on Node 24 with vitest 4.1.9, naming the
combination. Vitest's custom-worker API does not work there — a bare worker entry that
imports nothing from this package fails identically — and the symptom is 37 failed
suites and a run that reports no tests, with nothing pointing at the cause. Node 20 and
22 are unaffected on the same Vitest, and Node 24 is fine on 4.1.8.
