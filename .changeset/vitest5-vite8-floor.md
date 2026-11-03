---
"vitest-native": minor
---

**Breaking: Vitest 5 and Vite 8 are now required** (peer ranges `vitest` `>=5 <6`, was `>=4 <6`; `vite` `^8.0.5`, was `^6.4.2 || ^7.3.2 || ^8.0.5`). Vitest 4, or Vite 6 or 7, stops the plugin at startup with `UNSUPPORTED_PEER`, naming the supported range and the version found; `vitest-native doctor` reports the same.

Upgrading: install `vitest@^5` (with matching `@vitest/*` packages such as `@vitest/coverage-v8`) and `vite@^8`. Then:

- Vitest 5 clears mocks before every test by default (`clearMocks: true`). A suite that asserts on calls recorded before the test started sets `test.clearMocks: false`.
- A Vitest 4 config that set `test.experimental.fsModuleCache` can drop it: the plugin turns Vitest 5's `fsModuleCache` on unless the config sets it.
- Babel plugins your tests need go through `@rolldown/plugin-babel`, not `@vitejs/plugin-react`'s `babel` option (removed in plugin-react 6 for Vite 8).

Removed with the old versions: the `vitest-native doctor` note about Vitest 4's transform cache, and the warning that Vite 6 and 7 cannot resolve an Expo project's tsconfig `paths`.
