---
"vitest-native": patch
---

Fix three cross-file leaks under the hot runtime and relative paths in `jest.setMock`

- A `jest.doMock`/`vi.doMock` issued after a file's last import was applied to the next
  file's imports. Vitest queues such mocks until the next import, and the per-file reset
  cleared the mock registries but not that queue; it now clears it too.
- React Native Testing Library, which the hot runtime keeps loaded once per worker,
  registered its automatic cleanup and act-environment hooks only in the first file that
  imported it. Later files left their trees mounted, and `screen` could return the previous
  file's tree. When a file imports a resident RNTL, its entry module now re-runs against the
  resident instances, so each file that imports RNTL gets RNTL's own hooks and a file that
  does not import it gets none, as under per-file isolation.
- `jest.setMock` and `jest.dontMock` resolved a relative path against the jest-compat shim
  instead of the calling test file, so the mock (or unmock) applied to the wrong module.
  Relative paths are now anchored at the caller, as Jest resolves them. Finding the caller
  also no longer skips a test file that lives in a directory named `jest-compat`.
