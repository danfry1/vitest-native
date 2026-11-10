# A cold run warns that the generated root-mocks module's sourcemap points to missing files

- **Class:** env-contract
- **Source:** #351 reporter's app shape (root `__mocks__` under jest-compat), found by the 0.15 re-check (#732)
- **Fixed by:** #733
- **Needs:** nothing beyond this repository's install

## The bug

An app whose only root manual mocks are of packages a preset stands in for got, on every cold run (CI, or the first run after a cache clear), `Sourcemap for "<root>/vitest-native.root-mocks.mjs" points to missing source files`. The module is generated and has no file on disk; with no `jest.mock` of its own to rewrite, its only map pointed at that path with no content, so Vite looked for it on disk.

## Expected behaviour

No such warning: the generated module's map carries its own source. The control (`rootMocks: false`) has no generated module.
