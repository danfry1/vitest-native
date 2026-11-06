---
"vitest-native": minor
---

**Breaking: vitest-native now requires Node 22.22.3+, 24.12+ or 26+, for both engines.** An unsupported Node stops at startup with `UNSUPPORTED_NODE`, naming the release to install; `vitest-native doctor` reports the same.

Update Node within your major, or move from Node 20, 23 or 25 to a supported line, including CI images and `.nvmrc` or `engines` pins. Remove `VITEST_NATIVE_LOADER_THREAD` from scripts and CI; it no longer has an effect.

- A runtime without `module.registerHooks` (Bun) gets `UNSUPPORTED_NODE` too.
- The support policy is in `docs/versioning.md`.
