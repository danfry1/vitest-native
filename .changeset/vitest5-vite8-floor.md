---
"vitest-native": minor
---

**Breaking: vitest-native now requires Vitest 5 and Vite 8.** Vitest 4, or Vite 6 or 7, stops at startup with `UNSUPPORTED_PEER`, naming the supported range; `vitest-native doctor` reports the same.

Install `vitest@^5` with matching `@vitest/*` packages, and `vite@^8.0.5`.

- Vitest 5 clears mocks before every test (`clearMocks: true`). A suite that asserts on calls recorded before the test started sets `test.clearMocks: false`.
- The plugin turns on Vitest 5's `fsModuleCache` unless the config sets it, so a Vitest 4 `test.experimental.fsModuleCache` line can go.
- Babel plugins your tests need go through `@rolldown/plugin-babel`; `@vitejs/plugin-react` 6 removed its `babel` option.
