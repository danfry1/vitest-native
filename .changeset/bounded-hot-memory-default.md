---
"vitest-native": patch
---

Bound hot-runtime memory by default. When `hotRuntime` is enabled on the native engine and neither `memoryLimit` nor `recycleAfterFiles` is configured, a default per-worker memory ceiling of `clamp(totalmem * 0.25, 768MB, 1.5GB)` is now applied. Hot workers keep React Native resident and accumulate roughly 4 MB per file, so without a bound a long suite could grow toward OOM; the default lets multi-worker runs recycle a worker once it crosses the ceiling, keeping total memory bounded out of the box.

An explicit `memoryLimit` or `recycleAfterFiles` is respected unchanged. Single-worker hot still cannot recycle (Vitest batches all files into one scheduler task), so the bound is inert there and the existing one-time "recycling INACTIVE" warning advises running with `maxWorkers >= 2`.
