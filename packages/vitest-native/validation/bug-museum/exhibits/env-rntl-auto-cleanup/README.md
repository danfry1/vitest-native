# RNTL's auto-cleanup never runs with globals: false

- **Class:** env-contract
- **Source:** monorepo migration report #17
- **Fixed by:** #342 (`origin/fix/rntl-cleanup-and-fake-timers`)
- **Needs:** nothing beyond this repository's install

## The bug

RNTL registers its afterEach cleanup only if `afterEach` is a GLOBAL. With explicit imports (Vitest's default `globals: false`, and the end state of a migration) every rendered tree stayed mounted, and later tests saw earlier screens.

## Expected behaviour

Each test's tree is unmounted after the test, as under Jest: the next test sees the effect cleanup.
