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

# React Native/RNTL and the idiomatic workload, using an experiment-only project
# TS/TSX/JSX loader and source resolver.
vitest run --config validation/native-runner/vitest.load.mts
```

`vitest.load.mts` disables Vitest's experimental Node mock loader because it does not
currently compose with the production asynchronous React Native loader: with both
enabled, the test entry does not execute and Vitest reports no suite. The project
loader also preserves live RNTL CommonJS reads so `screen` follows the render result.

This route is therefore not a production candidate yet. See
`docs/runtime-architecture-bakeoff.md` for the measured results and upstream work.
