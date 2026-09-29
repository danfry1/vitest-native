---
"vitest-native": patch
---

Build native-engine preset mocks on first use in each test file

The native setup rebuilt every auto-detected preset mock for every test file — in
a project with twenty presets, about 900 `vi.fn()` mocks per file, most for
packages the file never imports. Vitest keeps every mock it has created (for
`vi.clearAllMocks()`), so under the hot runtime each file's unused mocks stayed
reachable for the rest of the run: worker heap grew about 4 MB per file and a
1,000-file single-worker run ran out of memory. Each preset mock is now built
the first time a file uses it, and still fresh for every file. On the same run,
worker heap after 562 tests fell from about 2.4 GB to about 0.45 GB and 1,000
files complete in about 1.5 GB.
