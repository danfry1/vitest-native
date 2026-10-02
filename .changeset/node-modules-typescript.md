---
"vitest-native": patch
---

Fix Expo packages whose TypeScript source has no type syntax failing to load

Expo packages publish their TypeScript source (`expo-modules-core`'s `main` is `src/index.ts`),
and the native engine compiles it before Node runs it. A file that Node could already parse was
handed to Node unchanged, which is right for JavaScript but not for TypeScript: Node refuses any
`.ts` file under `node_modules`, whatever it contains. `expo-modules-core/src/polyfill/index.ts`
is a bare `// noop`, so a test rendering the Expo SDK 57 template's `Collapsible` (through
`expo-symbols`) failed with "Stripping types is currently unsupported for files under
node_modules". TypeScript files are now always compiled.
