---
"vitest-native": patch
---

**`vitest-native migrate` names each `jest.mock()` factory that reads a module-level `const`, `let` or `class` while it runs.** Mock factories run before the test file's body, so under Vitest such a read throws "Cannot access '…' before initialization". Under Jest it often read `undefined` instead, because React Native's Babel preset compiles `const` to `var`. Reads inside a function the factory returns are not reported. Move the value into the factory, or create it with `vi.hoisted()`.
