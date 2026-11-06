---
"vitest-native": minor
---

**Behaviour change: snapshots of React Native trees print in Jest's format.** Run `vitest -u` once to re-record existing vitest-native snapshots, then review the diff. vitest-native no longer registers its own serializer, so trees print as Jest and Vitest print React trees, and Jest-written snapshots read the same.

- No host prints `ref`. A host ref, such as a `Text` ref under the native engine or any host ref under the mock engine, is now an instance with `measure`, `focus` and the other native methods, where it used to be the test renderer's node or `null`.
- `vitest-native/serializer` keeps the old format for one release; it is deprecated.
