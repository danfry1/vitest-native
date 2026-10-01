---
"vitest-native": patch
---

Fix inline `test.projects` on Vitest 5 running without vitest-native's setup

Vitest 5 lets an inline project (`projects: [{ extends: true, … }]`) share the declaring
config's Vite server and builds its `test` options from the raw user config, before any
plugin's `config` hook runs. Those projects lost everything vitest-native adds to `test` —
setup files, module ownership, env, the hot runtime — and their tests failed to load. The
plugin now pins each inline project's `root` to the root it inherits anyway, which makes Vitest
resolve it through the config file with the plugin, as on Vitest 4. This works in a nested
config too, where `test.sharedViteServer` (read only from the top-level config) cannot help. A
project that still reaches the run without the plugin's setup fails with `SHARED_VITE_SERVER`.
