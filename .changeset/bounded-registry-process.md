---
"vitest-native": patch
---

Bound cold React Native registry compilation outside the long-lived Vite process

Cold registry cache misses now compile in a short-lived child with a 96 MiB old-space
cap and a 256 MiB retry only for a recognized V8 heap OOM. The parent validates the
atomic cache result, warm runs remain spawn-free, and ordinary failures keep the
visible correctness-preserving per-file fallback. Registry keys now include
normalized asset extensions, which affect emitted module code.

A real 438-module production gate checks artifact parity, persistent-parent RSS,
warm lookup, bounded latency, and concurrent cold writers.
