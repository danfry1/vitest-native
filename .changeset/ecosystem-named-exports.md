---
"vitest-native": patch
---

Auto-detected CommonJS packages expose all of their named exports again

Node decides a CommonJS module's named exports with `cjs-module-lexer`, which reads
the source statically and stops at shapes it cannot follow. Given ordinary
hand-written CommonJS:

```js
module.exports = { Banner({ label }) {}, renderCount: () => n };
```

Node reports the named exports as `["Banner", "default", "module.exports"]` —
`renderCount` is missing, and a name that is not an export appears. That is plain
Node behaviour, reproducible with no plugin involved.

It became reachable when auto-detected React Native packages moved from Vite's graph,
whose interop enumerates the real object at run time, into Node's. `import { useFoo }
from 'some-rn-lib'` could then fail with "does not provide an export named", for the
hand-written CommonJS libraries auto-detection exists to support.

Transformed packages are now served with the dead `0 && (module.exports = { … })`
hint that the lexer does understand — the same mechanism React Native's own index
facade already used. Names come from the transform's own output, read from its AST,
rather than from requiring the module: the ESM hook runs on the module-loader thread,
where the CommonJS hooks that compile JSX are not installed, so requiring there fails
outright. A module whose shape is not statically knowable (`module.exports =
someValue`) emits no hint and keeps Node's own detection, which is no worse than
before.

The package budget is re-baselined to ~5% above the measured artifact, which is what
its own policy asks for, rather than left to fail on the next change.
