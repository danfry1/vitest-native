# A pnpm store directory named after its peers decides a package's ownership

- **Class:** ownership
- **Source:** ADR-0004 decision 3 (names matched only on whole path segments, tested with decoy paths); the class of #349
- **Fixed by:** none needed on main; the guard for ownership track A5 (the total predicate)
- **Needs:** a pnpm-shaped store (`layout: pnpm`, assembled locally from this repository's install)

## The bug this guards against

pnpm puts a package with peers in a store directory named after them:
`.pnpm/museum-counter@1.0.0_react@<v>_vitest@<v>/node_modules/museum-counter`. A rule
that matches a package name anywhere in a path, rather than as a `node_modules/<name>/`
segment, reads this ordinary package as React or as the test runtime, which the hot
runtime keeps resident across test files. Its module state then carries from one file
to the next. #349 was this class: a library resolver matched `react-native-worklets`
inside a store directory's name.

Main's matchers are anchored on segments, so main passes. The predicate rewrite (A5)
moves every ownership rule into one `decideFile`; this exhibit holds it to segments.

## Expected behaviour

An installed package is a fresh module in each test file, as under Jest: `next()` is 1
in both files, which run in one hot worker (a before b).

## How it is proven

Main passes, and no commit on main had the bug. A copy of main's `dist` whose
test-runtime matcher accepts a name followed by `@` anywhere in the path (a name inside
a store directory's name) fails it as its bug: `b.test.ts: expected 2 to be 1`.

## Control

Without peers, the store directory is `museum-counter@1.0.0` and names no other package.
