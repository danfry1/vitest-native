# 0008-b. Retire a worker whose resident React is unusable; when it cannot be retired, fail later files by name

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Partly: shipped as `resident-health.mjs` with `HOT_RESIDENT_UNUSABLE`; the `ACT_LEFT_OPEN` and `WORKER_DIRTY_SKIPPED` codes do not exist, and only an open act scope is detected.
- **Enforced by:** `packages/vitest-native/scripts/test-hot-act-scope.mjs`, `packages/vitest-native/tests/resident-health.test.ts`, `.github/workflows/ci.yml`
- **Related:** [0008-a](0008-a-small-resident-renderer-set.md) (depends on)

## Decision

Never fail silently: a file that passes under Jest may fail only through a named limit with
a remedy. A worker that ends a file with pending resident work (an open `act` scope or held
host callbacks) is retired unconditionally: the pool's `canReuse` refuses it before the
memory coordinator is asked. When another file follows in the same task (one worker), every
remaining file fails by name with the remedy, with a failed status and a non-zero exit,
never Vitest's skip. React's internals are only read, never written.

## Context

Under the hot runtime, a file that leaves React's `act` scope open (`void act(async ...)`,
or a test that timed out inside `act`) makes every later render on that worker queue and
never commit, so later files fail on their own renders, far from the cause. The memory
coordinator lets one worker recycle at a time and could refuse the request. At one worker
Vitest batches every file into one task, so the worker cannot be replaced between files.

## Consequences

- **Gains:** an open `act` or stuck scheduler never reaches the next file unannounced; the failure names the file that left it.
- **Costs:** one recycle per dirty file; the act-queue read is a seam on React's exported internals.
- **Limits:** at one worker, a leaked `act` with more files following fails the rest of the batch with `HOT_RESIDENT_UNUSABLE`; the remedy is more than one worker or `hotRuntime: false`.

## Alternatives rejected

- Fail only the leaking file at one worker: the files after it run on a dirty React and can pass falsely.
- Recycle through `canReuse` alone: the memory coordinator can refuse it.
- Write React's internals to close the scope: enumeration into React.
