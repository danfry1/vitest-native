---
"vitest-native": patch
---

Scope React Native path detection to `node_modules`. The native engine identified
React Native package files with the regex `/[\\/]react-native[\\/]/`, which also
matched any project checked out under a directory named `react-native` (for example
`/home/runner/work/react-native/react-native/` in CI for a repo named `react-native`).
Every project file then matched, so `.tsx` test files were externalized and sent raw
to Node (`Unknown file extension ".tsx"`) and `vi.mock()` calls stopped hoisting.
The matchers in `apply.ts`, `loader.mjs`, and `hooks.mjs` now require a
`node_modules/` segment, which still matches real RN and `@react-native/*` packages
(including pnpm-nested layouts) without false-matching project paths.
