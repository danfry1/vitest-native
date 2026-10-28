# A Jest partial mock of project source gets a second module graph

- **Class:** ownership
- **Source:** monorepo migration report #10
- **Fixed by:** #345 (draft) (`origin/fix/require-actual-single-graph`)
- **Needs:** nothing beyond this repository's install

## The bug

`jest.mock(p, () => ({ ...jest.requireActual(p), other: jest.fn() }))` is Jest's canonical
partial mock. jest-compat's runtime `requireActual` is synchronous, so Node's CommonJS hook
compiles `p` and its whole graph, store included, as a second copy: the real members of
the mock read Node's store while the app writes Vite's. Silent.

## Expected behaviour

The real members of a partial mock share the app's module instances: `read()` sees what the app wrote.
