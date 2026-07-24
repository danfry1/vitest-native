---
"vitest-native": patch
---

Narrow the mock engine's Flow-strip, and stop `migrate` opting packages out of auto-compilation

**Flow-strip targeting.** The mock engine compiles React Native ecosystem packages
pulled into the Vite graph, selected by testing for `react-native` anywhere in the
file's path. That also matched every dependency of a project in a directory called
`react-native-app`, and packages like `eslint-plugin-react-native` — running a Flow
parser over files with nothing to do with React Native. It now matches the package
name after `node_modules`: a name beginning with `react-native` (scoped or not, so
`@shopify/react-native-skia` counts) or a scope beginning with `@react-native`.
Everything the substring test legitimately caught is still caught, and nothing else
is.

**`npx vitest-native migrate`.** It translated Jest's `transformIgnorePatterns` into
`transform: [...]` entries for packages the engine now detects and compiles by itself.
That was worse than redundant: an explicit `transform` entry takes precedence, so the
suggested config would have opted those packages back out of inlining, losing
`vi.mock` support for no gain. Packages declaring `react-native` are now reported as
already handled.

Also adds a test that the plugin's virtual `react-native` module exports exactly what
the mock provides — the two lists were in step, but only by hand.
