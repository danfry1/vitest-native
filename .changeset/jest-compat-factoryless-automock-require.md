---
"vitest-native": patch
---

**A factory-less `jest.mock('pkg')` now automocks `pkg` for `require()` too, as under Jest.** Before, only the test's imports got Vitest's automock: a `require('pkg')` in the test or in an installed package got the real package. The mock is now one automocked instance that every load in the file shares. No action needed.

- Applies to an installed package with no manual mock; a manual mock still wins.
- Relative or aliased project modules, Node core modules and `react-native` keep Vitest's own handling.
