# RNTL 13 with globals: false: no auto-cleanup between tests

- **Class:** harness
- **Source:** #342 (CI failure on RNTL 13, 2026-10-28)
- **Fixed by:** #342 (merged)
- **Needs:** rntl 13

## The bug

With `globals: false` (Vitest's default) RNTL registers its auto-cleanup only when
`afterEach` is a global, so before #342 nothing unmounted a test's tree on RNTL 13 and
the next test started with the previous tree still mounted (#17).

## Expected behaviour

On RNTL 13 with globals: false, the next test sees the previous tree's effect cleanup.

## Notes

This exhibit shows that a cleanup runs on RNTL 13, not which one. RNTL 13's synchronous
`cleanup()` leaves each unmount running, but its effect destructors still run before
the next test, so this tree's state cannot tell it from `cleanupAsync()`. #342 calls
`cleanupAsync` where RNTL exports it; that choice is pinned by the package's unit test
`tests/rntl-support-cleanup-choice.test.ts`, not by this exhibit.
