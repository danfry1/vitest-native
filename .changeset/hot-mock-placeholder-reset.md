---
"vitest-native": patch
---

On Vitest 4, the hot runtime no longer hands a test file the previous file's `vi.mock` factory. When one file mocked a module with a factory and a later file mocked the same module any other way, such as an automock with `vi.mock(path)`, the later file got the earlier file's factory. Vitest 4.1 keeps a module mocked with a factory as a placeholder that remembers the factory, and the hot runtime's per-file reset left that placeholder in place. The reset now invalidates such modules, so each file fetches them again under its own mocks. Vitest 5 was not affected.
