# A recoverable React error exits 1 with every test passing

- **Class:** env-contract
- **Source:** monorepo migration report #13
- **Fixed by:** #343 (`origin/fix/recoverable-errors-and-expo-os`)
- **Needs:** rntl 13

## The bug

React resolves its error reporter at load: `reportError`, else `window.ErrorEvent`, else `process.emit('uncaughtException')`. Under Node that is the last, which Vitest counts as an unhandled error: exit 1 with every test passing (react-test-renderer 19 on RNTL 12/13). Jest's sandbox has no listener and drops it; a device logs it.

## Expected behaviour

The recoverable error is logged (console.error), the test passes, and Vitest exits 0.
