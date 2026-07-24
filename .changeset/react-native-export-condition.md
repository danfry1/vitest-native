---
"vitest-native": patch
---

Resolve React Native package entries the way Metro does

Both engines set `resolve.conditions: ['react-native']`, which governs Vite's *client*
environment. Vitest runs tests in the **ssr** environment, which keeps its own list —
Vite drops both `conditions` and `mainFields` when deriving it — so neither was ever
applied to anything a test imported.

Any package shipping a distinct React Native build behind that condition therefore
loaded its web build instead:

```jsonc
"exports": { ".": { "react-native": "./native.js", "default": "./web.js" } }
```

The same held for the legacy mechanism, still used by packages published before
`exports`:

```jsonc
"main": "./web.js", "react-native": "./native.js"
```

Metro resolves both ahead of the standard fields, so tests were exercising code the
app never runs, with nothing to indicate it. Both are now set for the ssr environment
as well as the client one, under both engines, with a regression test each.

`browser` is deliberately not added to `mainFields` even though Metro lists it: under
Node it would pull the web build of any package that has a browser field and no
react-native one.

**Upgrade note.** The `react-native` field is honoured wherever it appears, not only
on React Native libraries — Algolia's clients, `nanoid` and `msgpackr` all ship one,
usually pointing at a browser or ESM build. Metro resolves those the same way, so this
is the build the app actually runs, but a dependency may now load a different file
than it did before. If that is a problem for one package, `transform: ['the-package']`
or an explicit `resolve.alias` pins it.
