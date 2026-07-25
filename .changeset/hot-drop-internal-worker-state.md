---
"vitest-native": patch
---

Remove the hot runtime's last dependency on Vitest's internal worker state

The hot runtime re-enabled Vitest's per-file isolation by mutating
`state.ctx.config.isolate` inside the worker — a shape nothing contracts. It now
performs the two operations that flag was buying (`mocker.reset()` and a clear of the
evaluated module graph) directly, through public API: the `onModuleRunner` hook of
`vitest/worker`'s `init()`, and Vite's `ModuleRunner.clearCache()`.
