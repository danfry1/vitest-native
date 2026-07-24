---
"vitest-native": minor
---

`vi.mock('react-native')` now works under the native engine

React Native runs in Node's module graph under `engine: 'native'`, which put it
outside Vitest's module registry — so `vi.mock('react-native', …)`, the single most
common thing an existing Jest suite does, silently had no effect. It was the most
frequently hit blocker when moving a real suite over.

The app and test graph now import React Native through a facade module the plugin
serves. The facade re-exports the same instances Node's graph holds, so React
Native's behaviour and object identity are unchanged — an externalized library and
your test still see the very same `Dimensions`, `Platform`, and `StyleSheet`. What
changes is that Vitest owns the module id, which is what lets it intercept:

```ts
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  Alert: { alert: vi.fn() },
}));
```

`importOriginal()` returns real React Native, everything left unmocked stays real,
and components still render React Native's own host components (`RCTView`, not a
stand-in).

One limit worth knowing: the interception covers modules in your project's graph —
your app and test code. A third-party package that Vitest externalizes resolves
React Native through Node and will still see the unmocked module. Add such a package
to `transform: [...]` if its view of React Native needs to be mocked too.
