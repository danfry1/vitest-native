---
"vitest-native": patch
---

Fix `vitest-native/rntl-matchers` under TypeScript 7 with RNTL 14. RNTL 14 adds its matchers to the global `jest.Matchers<R>`, which Vitest's `JestAssertion` extends with `R = void`; the entry added them again with Vitest's assertion type, and TypeScript 7 rejects the two differing declarations (TS2320) for projects that typecheck declaration files (`skipLibCheck: false`). The entry now uses the same instantiation, so the declarations agree and the matchers stay typed.
