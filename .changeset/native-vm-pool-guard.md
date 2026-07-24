---
"vitest-native": patch
---

Explain why `engine: 'native'` cannot run on a VM pool

Now that a configured `pool` is respected rather than overridden, `vmThreads` and
`vmForks` reach the native engine — where they cannot work. VM pools execute test code
in a `vm` context whose module executor bypasses Node's loader, and `module.register()`
(how the engine installs the ESM hook that Flow-strips React Native and resolves its
platform files) throws there outright. The failure surfaced far from its cause, as
`Platform.OS` being undefined deep inside `NativeEventEmitter`.

The plugin now refuses at config time and names the alternatives: `threads` (the
default), `forks`, or `engine: 'mock'`, which needs no hooks.
