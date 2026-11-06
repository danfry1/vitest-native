---
"vitest-native": patch
---

**Under the native engine, an installed package's TypeScript source now loads once when a test both requires and imports it.** Vitest pulled the file into Vite for the import, while Node compiled its own copy for the `require`, so the two copies didn't share module state. Vite now leaves `.ts` and `.tsx` files under `node_modules` to Node, which compiles them for both. No action needed.
