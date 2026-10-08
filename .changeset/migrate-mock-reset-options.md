---
"vitest-native": patch
---

`migrate` writes Jest's mock-clearing behaviour correctly:

- Jest's `resetMocks` becomes `test.mockReset`, Vitest's name for it. It was written as `test.resetMocks`, which Vitest ignores.
- When the Jest config does not set `clearMocks`, the generated config sets `clearMocks: false`, Jest's default. Vitest 5 defaults it to `true`, which clears calls mocks received while modules loaded before each test.
