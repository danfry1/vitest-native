---
"vitest-native": patch
---

Fix inline `test.projects` on Vitest 5 running without vitest-native's setup

Vitest 5 lets an inline project (`projects: [{ extends: true, … }]`) share the declaring
config's Vite server and builds its `test` options from the raw user config, before any
plugin's `config` hook runs. Those projects lost everything vitest-native adds to `test` —
setup files, module ownership, env, the hot runtime — and their tests failed to load. The
plugin now sets `test.sharedViteServer: false` when inline projects are declared, so each one
resolves through the config file and gets the plugin, as on Vitest 4. An explicit
`sharedViteServer: true` with inline projects fails with `SHARED_VITE_SERVER`.
