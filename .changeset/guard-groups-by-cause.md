---
"vitest-native": patch
---

**The `SOURCE_EVALUATED_TWICE` warning prints one entry per cause instead of one per file.** Files Node loaded through the same first `require()` are grouped: the first is printed in full, and the end-of-run summary gives each cause one line with its file count, its test files and the fix. On a large suite, one `jest.mock` factory's `require` could print thousands of warnings; it is now one summary line and one warning per worker. The fix line names `await vi.importActual(...)` in an async factory, or `experimental.ownershipModel: 'resolution'`. No action needed.
