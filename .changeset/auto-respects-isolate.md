---
"vitest-native": patch
---

Keep Vitest's own settings under `hotRuntime: 'auto'`, including CLI flags

- An explicit `test.isolate` (or `--isolate` / `--no-isolate`) is now a reason for `'auto'` to keep
  Vitest's semantics instead of selecting the hot runtime: `true` gets a fresh worker per file,
  `false` one module graph shared across files, as Vitest documents them.
- On Vitest 4, CLI flags such as `--maxWorkers=1`, `--no-file-parallelism`, `--pool` and
  `--no-isolate` reach the resolved config only after plugins' config hooks run, so `'auto'` chose
  the hot runtime without seeing them. `vitest run --maxWorkers=1` then failed with
  `HOT_MEMORY_UNBOUNDED` and did not exit. The choice is now re-checked against the resolved config
  before any worker starts, per project and on both Vitest majors: `'auto'` falls back to Vitest's
  settings (including its worker count) and says so.
- An explicit `hotRuntime: true` no longer overrides a configured pool or `test.isolate` with a
  warning, or a conflicting CLI flag silently: it fails at startup with `HOT_RUNTIME_OVERRIDDEN`.
- `--pool=vmThreads` / `--pool=vmForks` on the command line now fail with `UNSUPPORTED_POOL`, as
  the same pools in the config already did.
- The engine banner names the hot runtime when it is in use, so a cross-file failure points at
  `hotRuntime: false` from the first line of the log.
