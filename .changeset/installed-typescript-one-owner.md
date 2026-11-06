---
"vitest-native": patch
---

**Under the native engine with `experimental.nodeMocks` on, an installed package's TypeScript source now loads once when a test both requires and imports it.** Vitest pulled the file into Vite for the import, while Node compiled its own copy for the `require`, so the two copies didn't share module state. With `nodeMocks` on (or `ownershipModel: 'resolution'`), Vite now leaves `.ts` and `.tsx` files under `node_modules` to Node, which compiles them for both, and a `vi.mock` still reaches their imports. With default flags nothing changes. The warning for this case now names `experimental: { nodeMocks: true }` as the fix. To get one copy, add `experimental: { nodeMocks: true }`.
