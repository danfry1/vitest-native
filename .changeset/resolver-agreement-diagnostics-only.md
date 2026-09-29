---
"vitest-native": patch
---

Report the resolver-agreement warning (`'x' resolves to two different files`) only under `diagnostics`. The check compares Node's resolution against the package manifest and cannot see Vite's module graph, so it fired for packages that only Node ever requires — `test-renderer` (required by React Native Testing Library), `nanoid` (required by postcss) and Babel's source-map packages — printing on every test file. The warning now also states that it is a risk rather than a proven duplicate, and that its comparison uses Vite's default main fields.
