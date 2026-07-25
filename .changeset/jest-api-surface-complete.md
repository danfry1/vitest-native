---
"vitest-native": patch
---

Complete the `jest` global's API surface

Eleven documented Jest members were absent from the `jest` global, so a migrated suite
calling one got `TypeError: jest.X is not a function` — the bare failure the shim's
signposting already existed to prevent. The gaps included siblings of members that
were covered: `isolateModules` was signposted but not `isolateModulesAsync`,
`deepUnmock` but not `dontMock`.

Three had a Vitest equivalent under a different name and now use it:

- `jest.dontMock(m)` → `vi.doUnmock(m)`
- `jest.setMock(m, exports)` → `vi.doMock(m, () => exports)`
- `jest.now()` → the current clock, faked or real

The rest throw an error naming the API and its closest migration, as the other
unsupported members already did: `isolateModulesAsync`, `unstable_mockModule`,
`replaceProperty`, and the automock family (`enableAutomock`, `disableAutomock`,
`autoMockOff`, `autoMockOn`, `onGenerateMock`), which has no Vitest counterpart at all.
