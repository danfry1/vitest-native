# vi.mock does not reach a Node-owned package's own import of the mocked module

- **Class:** ownership
- **Source:** #322
- **Fixed by:** open (ownership track A6)
- **Needs:** nothing beyond this repository's install

## The bug

Under the native engine, `vi.mock('expo-constants', factory)` applies to imports in
Vite's graph: the test file and inlined packages. It does not apply to a package Node
loads that imports the same module itself, such as `expo-linking`: Node's `require`
returns the real module. Under jest-expo the mock reaches it, because Jest has one
module registry. `jest.mock` with jest-compat already reaches it (it registers the
factory with the Node-side registry); plain `vi.mock` does not. Silent: the library
reads real values.

Here `museum-linking` (an installed React Native package, so Node owns it) imports
`museum-constants`, which the test mocks with `vi.mock`, without jest-compat.

## Expected behaviour

A `vi.mock` factory applies to every load of the module, as a `jest.mock` factory does:
`createURL("home")` returns `mocked://home`.

## Control

`museum-linking` no longer peers on `react-native` and is inlined (`server.deps.inline`),
so Vite owns it and its import goes through Vite's graph, where the mock applies. (The
engine refuses to inline a React Native package: `INLINE_BREAKS_OWNERSHIP`.)
