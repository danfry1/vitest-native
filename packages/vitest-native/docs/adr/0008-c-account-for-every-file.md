# 0008-c. Every file the hot runtime is given comes back with a result

- **Status:** Accepted
- **Date:** 2026-10-28
- **Implemented:** Yes
- **Enforced by:** `packages/vitest-native/scripts/test-hot-file-accounting.mjs`, `.github/workflows/ci.yml`
- **Related:** [0008-b](0008-b-retire-unusable-resident-workers.md)

## Decision

The worker and the host each count the files a task was given against the files that
reported. A file that produced no result is reported as failed, with an error naming it,
and the run fails.

## Context

When a task breaks outside any test file (a reset that throws before collection, or a
per-file spy restore that fails), Vitest records only a run-level error, which the JSON
reporter does not carry. The files after the break vanish: no failed test, no file entry,
and the exit code can still look healthy. A gate that trusts the exit code or a test count
cannot see this.

## Consequences

- **Gains:** a lost file is a failure with a name, not a silent gap in the report.
- **Costs:** one bookkeeping message per file between worker and host.
- **Limits:** the failure names the file it surfaced in; the cause may sit in an earlier file of the task.

## Alternatives rejected

- Trust Vitest's exit code and test counts: both miss a file that was never collected.
