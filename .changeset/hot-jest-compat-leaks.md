---
"vitest-native": patch
---

Fix three cross-file leaks under the hot runtime and relative paths in `jest.setMock`

- A `jest.doMock`/`vi.doMock` issued after a file's last import was applied to the next
  file's imports. Vitest queues such mocks until the next import, and the per-file reset
  cleared the mock registries but not that queue; it now clears it too.
- React Native Testing Library, which the hot runtime keeps loaded once per worker,
  registered its automatic cleanup and act-environment hooks only in the first file. Later
  files left their trees mounted, and `screen` could return the previous file's tree. Its
  entry module now re-runs for each later file against the resident instances, so every
  file gets RNTL's own hooks, as under per-file isolation.
- `jest.setMock` and `jest.dontMock` resolved a relative path against the jest-compat shim
  instead of the calling test file, so the mock (or unmock) applied to the wrong module.
  Relative paths are now anchored at the caller, as Jest resolves them.
