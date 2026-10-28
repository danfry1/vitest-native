# RNTL 13's synchronous cleanup leaves React 19 unmounts pending

- **Class:** harness
- **Source:** #342 (CI failure on RNTL 13, 2026-10-28)
- **Fixed by:** #342 (`origin/fix/rntl-cleanup-and-fake-timers`)
- **Needs:** rntl 13

## The bug

On RNTL 13 the auto-cleanup must await `cleanupAsync`: RNTL 13's synchronous `cleanup()`
calls each unmount without awaiting it, so under React 19 the unmount is still pending
and the tree's effect cleanups have not run when the next test starts. Found when #342's
own test passed on RNTL 14 and failed in CI's RNTL 13 cell; with globals: false main has
no cleanup at all (#17).

## Expected behaviour

On RNTL 13 with globals: false, the next test sees the previous tree's effect cleanup.
