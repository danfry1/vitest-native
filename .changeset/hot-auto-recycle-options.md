---
"vitest-native": minor
---

**`hotRuntime: 'auto'` can take recycling options: `{ mode: 'auto', memoryLimit }`.** It runs hot with your options where the run can be bounded, and falls back to per-file isolation, printing why, where it cannot (one worker, `--pool`, `--isolate`). To use it, add `mode: 'auto'` to the object form.

- Without `mode`, the object form still requires the hot runtime, as `true` does.
- Not covered: `mode: 'auto'` with `allowUnboundedMemory`, which is rejected.
