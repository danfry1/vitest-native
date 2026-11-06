---
"vitest-native": patch
---

**`vitest-native compare` no longer misses an error in `vitest run`'s output when stdout and stderr interleave.** The two streams were split into lines through one shared buffer, a chunk was decoded on its own, and an error header's message was taken from the next line of either stream. Depending on how the pipes delivered output, an `Uncaught Exception` or `Unhandled Rejection` could be dropped from the verdict. Each stream now has its own line buffer, UTF-8 decoder and pending header.
