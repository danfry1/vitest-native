# A workspace library a React Native sibling imports without declaring it is loaded twice

- **Class:** ownership
- **Source:** a monorepo report, reproduced here (#692)
- **Fixed by:** #692's fix (the closure walk follows a workspace package's undeclared runtime imports)
- **Needs:** nothing beyond this repository's install

## The bug

`@m/feature` is a workspace package that declares `react-native`, so Node loads its source.
Its `src/index.ts` imports `@m/lib`, a plain TypeScript workspace library, without listing it
in its `package.json`. The test imports both. Node loads `@m/lib` through `@m/feature`'s
source and Vite evaluates it again for the test's import: two copies of `src/index.ts`,
`src/store.ts` and `src/format.ts`, with separate state. The guard reports the three files.
Declaring `@m/lib` in `@m/feature`'s dependencies made it one copy, as did
`experimental.ownershipModel: 'resolution'` and `transform: { exclude: ['@m/feature'] }`;
`ownershipModel: 'resolver'` did not.

## Expected behaviour

One copy of each `@m/lib` file: Node loads `@m/lib` with `@m/feature` (ADR-0004 rule 7,
the workspace closure of a React Native workspace package), whether or not it is declared.
The test writes the store and `@m/feature` reads it.
