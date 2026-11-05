---
"vitest-native": patch
---

**`vitest-native migrate` now reads `jest.config.ts`, `.mjs`, `.mts` and `.cts`, in Jest's own lookup order.** TypeScript configs load through Node's type stripping (Node 22.18 or later). A config that still can't be loaded, such as one that relies on ts-node (an extensionless relative import, an `enum`), uses top-level `await` or exports a function, is now listed under "Needs your attention" with the reason, where before the report silently left out its settings. No action needed.
