# jestMockTransform without globals: vi is not defined

- **Class:** config
- **Source:** config-axis matrix (feat/config-axis-matrix), 2026-10-27
- **Fixed by:** open
- **Needs:** nothing beyond this repository's install

## The bug

`jestMockTransform()` hoists `jest.mock(...)` to `vi.mock(...)`, which refers to a global `vi`. With Vitest's default `globals: false` the hoisted call throws a bare `ReferenceError: vi is not defined` before any test runs: no hint that the transform needs globals, or an import.

## Expected behaviour

A file using `jest.mock` under jestMockTransform + jest-compat runs with globals: false (the transform brings its own `vi`), or the run names the missing setting.
