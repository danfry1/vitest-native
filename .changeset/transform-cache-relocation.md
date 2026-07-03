---
"vitest-native": patch
---

Native-engine transform cache rework: project-local, content-keyed, lazy Babel.

- **The transform disk cache moves from `os.tmpdir()` to the project's `node_modules/.cache/vitest-native/`** (tmpdir fallback when node_modules is absent or unwritable). tmpdir is ephemeral on CI runners — every job paid a full cold Babel transform of React Native's ~250-file boot graph — and macOS purges it periodically. The new location persists across runs and is restorable by standard CI dependency-cache actions. The V8 compile cache is colocated.
- **Disk entries are keyed by content hash (platform + source), not path + mtime + size.** Content keys survive fresh installs, Docker mtime normalization, and CI cache restores — and eliminate the stale-hit class where a same-size, same-mtime file with different content served wrong executable code. The cache directory name now also carries the `@babel/core` version alongside the preset version, so a Babel upgrade invalidates cleanly.
- **`@babel/core` loads lazily, only on a cache miss.** Loading Babel costs ~35ms vs ~0.5ms for the resolve-only version check, and under the default engine every isolated worker paid it even when every file came from the disk cache. Measured on the package's own native suite (warm cache): aggregate worker setup down ~30%, wall clock ~11% — the effect scales with test-file count.
