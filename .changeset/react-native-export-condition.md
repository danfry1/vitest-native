---
"vitest-native": patch
---

Apply the `react-native` export condition where tests actually resolve

Both engines set `resolve.conditions: ['react-native']`, which governs Vite's *client*
environment. Vitest runs tests in the **ssr** environment, which keeps its own
condition list — so the condition was never applied to anything a test imported.

Any package shipping a distinct React Native build behind that condition therefore
loaded its web build instead:

```jsonc
"exports": { ".": { "react-native": "./native.js", "default": "./web.js" } }
```

Metro applies this condition, so tests were exercising code the app never runs, with
nothing to indicate it. The condition is now set for the ssr environment as well as
the client one, under both engines, and is covered by a regression test in each.
