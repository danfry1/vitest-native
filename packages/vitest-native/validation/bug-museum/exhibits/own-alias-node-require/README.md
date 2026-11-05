# An installed package requiring a source-aliased workspace library by name gets its built copy

- **Class:** ownership
- **Source:** #344 (`monorepo-source-ownership.test.ts`, the required case)
- **Fixed by:** #454 (`experimental.ownershipModel: 'resolver'`; open)
- **Needs:** nothing beyond this repository's install

## The bug

The app points the workspace library `@m/feature` at its source with `resolve.alias`, so
Vite loads `packages/feature/src`. `museum-requires-feature` is an installed React Native
package, so Node owns it, and it `require`s `@m/feature` by name. Node's resolution does
not see Vite's alias: it follows the package's `main` to the built `lib/index.js`, a
second copy of the library with its own state. Silent: the installed package reads
`'built copy'` instead of the store the test wrote.

## Expected behaviour

The installed package's `require` reaches the same aliased source the test imports, so
`viaNode()` reads back `'written by the test'`.

## Control

`museum-requires-feature` no longer peers on `react-native`, imports the library instead
of requiring it, and is inlined (`server.deps.inline`), so Vite owns it and its import goes
through the alias. Inlining alone is not enough: the inlined CommonJS file's `require`
still reached the built copy.

## With the fix

STATUS.md records the flag off. Against #454's head (`ab3cabe`), `run.mjs --only
own-alias-node-require --ownership resolver` passes, and the same build without the flag
fails as the bug.
