---
"vitest-native": patch
---

`jest.requireActual` and `jest.requireMock` now apply the project's `resolve.alias` string entries. A partial mock such as `jest.mock('@/services/api', () => ({ ...jest.requireActual('@/services/api'), fn: jest.fn() }))` threw "Cannot find module" because `requireActual` resolves through Node, which does not apply Vite's aliases. Aliases match on the whole specifier or a `/` boundary (an `@` alias does not capture `@scope/pkg`), the longest match wins, and an extensionless result is resolved with the platform's extension order (`@/Button` → `Button.ios.tsx`). Regex aliases and custom resolvers cannot reach the test worker; when one is configured, an unresolved specifier reports that instead of a bare "Cannot find module".
