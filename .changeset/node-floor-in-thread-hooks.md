---
"vitest-native": minor
---

**Breaking: Node 22.22.3+ on Node 22, 24.12+ on Node 24, or Node 26 and later is now required** (`engines.node`: `>=22.22.3 <23 || >=24.12.0 <25 || >=26.0.0`), for both engines.

Upgrading: on Node 22 or 24, update within your major (`node --version` below 22.22.3 or 24.12.0). On Node 20, 23 or 25, move to a supported line. CI images and `.nvmrc`/`engines` pins in your project may need the same bump.

- These are the releases where Node's in-thread module hooks carry the native engine, so it now runs one loader, in-thread, on every supported Node.
- On an unsupported Node, `reactNative()` stops at startup with `UNSUPPORTED_NODE`, saying which release to install; `vitest-native doctor` reports the same. A runtime without `module.registerHooks` (Bun) gets the same code.
- `VITEST_NATIVE_LOADER_THREAD` is removed.

The support policy for Node, Vitest, React Native Testing Library and React is in `docs/versioning.md`.
