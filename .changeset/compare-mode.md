---
"vitest-native": minor
---

New `vitest-native compare` command: it runs a project's suite under its own Jest and under Vitest, one after the other, and lists every test whose result differs.

- **Matching.** Tests are matched by file, `describe` titles and title. A test reported several times (projects, repeated titles) passes only if every copy passed. `it.each` titles, which each runner formats differently, are matched by position within their block and listed.
- **Buckets.** Each test lands in one: same result, regression (passes under Jest, fails under Vitest), improvement, skipped differently, or collected by only one runner. Regressions are grouped by their first Vitest error.
- **The claim.** The summary makes one claim: every test that passes under Jest also passes under Vitest, and `vitest run` exits 0. A test that is skipped, missing or not collected under Vitest counts against it. So do an unhandled error, a `process.exit` and a failing teardown, which Vitest's JSON report does not show. The headline names the engine vitest-native reported.
- **Exit codes.** 0 when the claim holds, 1 when it does not, 2 when a runner could not run or a project file changed, 130 when interrupted.

Neither run writes anything:

- Both run under `CI` without `UPDATE_SNAPSHOT`. Jest gets `--ci` last, and Vitest gets `update: false`.
- Every snapshot file Vitest resolves is read from an isolated copy, even through the project's own `resolveSnapshotPath`. With `CI` set, Vitest still rewrote the header of every Jest `.snap` file it read.
- Runner arguments pass through an allow-list.
- Any file in the project that changes during the run fails it.

A project without a Vitest config is compared under the config `vitest-native migrate` would write, which compare runs without saving it.

`--json <file>` writes a report to attach to an issue: test identities, statuses and error messages. Stack traces, code frames, Node's source excerpts and absolute paths are removed from messages. `--jest-results <file>` reads a Jest `--json` report made elsewhere instead of running Jest. Its paths are matched to the project, or `--jest-root` names the directory it was made in.

Each runner runs under a watchdog with a timeout (`--timeout`, default 1800 s). The watchdog stops the runner and its workers, and removes compare's temporary files, even if compare itself is killed.
