---
"vitest-native": minor
---

**Node 22.22.3 or later on Node 22, 24.12 or later on Node 24, or Node 26 and later is now required** (`engines.node`: `>=22.22.3 <23 || >=24.12.0 <25 || >=26.0.0`). Update Node within your current major; nothing else changes.

These are the releases where Node's in-thread module hooks (`module.registerHooks`) carry the native engine. Earlier releases with those hooks failed it (expo-router's navigation elements did not load, and the hot runtime's module reset misbehaved), so they used a second loader that ran the hooks on a separate thread through `module.register()`. That second loader is removed: every supported Node runs one loader, in-thread, beside the require hooks.

- On an unsupported Node the plugin stops at startup with `UNSUPPORTED_NODE`, naming the range: "Node 22.13.0 is not supported. vitest-native runs on Node 22.22.3 or later on Node 22, 24.12.0 or later on Node 24, and Node 26 or later …". `vitest-native doctor` reports the same range.
- `VITEST_NATIVE_LOADER_THREAD` no longer exists.
- Node 25 is not supported (it was never measured), and neither is Node 23, which is past its end of life.

The support policy for Node, Vitest, React Native Testing Library and React is in `docs/versioning.md`.
