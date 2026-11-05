# Vitest native-runner architecture probe

> **Historical branch.** The accepted upstream target uses the normal Vitest Node
> runner with full Vite module/mock reset in a reused worker. This probe remains
> evidence about loader composition and RNTL live bindings; see
> `../module-isolation/README.md`.

This experiment combines the production native engine with Vitest's
`experimental.viteModuleRunner: false` path.

```bash
# Vitest native runner without the React Native plugin.
vitest run --config validation/native-runner/vitest.minimal.mts
```

A second configuration ran React Native and RNTL through an experiment-only project
loader registered with `module.register()`, composed with the engine's asynchronous
loader. Both loaders were removed when the engine moved to in-thread hooks
(`module.registerHooks()`, Node 22.22.3+ / 24.12+ / 26+), so that configuration is gone;
its measured results stay in `docs/runtime-architecture-bakeoff.md`.

This route is therefore not a production candidate yet. See
`docs/runtime-architecture-bakeoff.md` for the measured results and upstream work.
