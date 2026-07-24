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
combination. On that combination every test file fails with "Cannot read properties of
undefined (reading 'config')" and the run reports no tests at all, with nothing
pointing at the cause. Node 20 and 22 are unaffected on the same Vitest, and Node 24 is
fine on 4.1.8. The cause is not yet established — it requires Node 24, vitest 4.1.9, a
custom worker entry and this plugin together — so this is a mitigation rather than a
fix.
