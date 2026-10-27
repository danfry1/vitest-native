# Compare mode: one suite, two runners

`vitest-native compare` runs a project's suite under Jest and under Vitest and lists every test whose
result differs. It is for a team that is trying vitest-native without committing to it yet. The team
does not have to judge the move from a pass count. It gets the tests that pass under Jest and not
under Vitest, grouped by error, plus a report it can attach to an issue.

```sh
npx vitest-native compare [--root <dir>] [--jest-args "<args>"] [--vitest-args "<args>"]
                          [--vitest-config <file>] [--jest-results <file>]
                          [--json <file>] [--top <n>] [--timeout <seconds>] [--show-output]
```

## What runs

**Jest** is the project's own Jest (`jest/bin/jest.js`, resolved from the root). Its config is the
one Jest finds by itself, or the one the `test` script names with `--config`. The script's
`--testTimeout`, `--maxWorkers` and `--runInBand` are passed too, because `migrate` maps those into
the Vitest config, so both sides get them. The run adds `--ci --json --outputFile=<temp>`.
`--jest-results <file>` reads the JSON of a Jest run made elsewhere, such as in CI, instead of running
Jest.

**Vitest** is the project's own Vitest (`vitest/vitest.mjs`) with the project's config, found the
way Vitest finds it (`vitest.config.*`, then `vite.config.*`) or named with `--vitest-config`. If
the project has no Vitest config yet, compare uses the config `vitest-native migrate` would write.
That config is executed but never saved: it lives in a temporary directory under `node_modules/`,
and its `import.meta.url` paths are pointed back at the root. This also means `migrate`'s output
gets run on a real suite, not just compared as text. The run adds `run --reporter=json`.

The two runs happen one after the other, not in parallel, so one does not slow the other down.

## Snapshots: neither runner touches the other's files

Both runs set `CI=true`, and Jest also gets `--ci`, so neither runner writes snapshots. That is
not enough on its own. Measured with Vitest 5.0.5 on this repository's fixture: with `CI=true`,
Vitest still rewrote the header of every Jest `.snap` file it read to `// Vitest Snapshot v1`, which
Jest then refuses to read. The snapshot keys also differ (`a > b 1` against `a b 1`; see
`migrating-from-jest.md`, section 2d). So compare's Vitest run reads `__vitest_snapshots__/` next to
each test, the recipe that guide gives, unless the project's config already sets
`resolveSnapshotPath`. The setting is added by a wrapper config that imports the project's
config, which is never edited. `-u`, `--update`, `--updateSnapshot` and `--ci=false` are refused in
`--jest-args` and `--vitest-args`.

A Vitest snapshot that was never recorded fails under `CI`, and the report marks those failures
"no Vitest snapshot recorded". To record them, run `vitest run` once with the same
`resolveSnapshotPath` setting, review the new files, and run compare again.

## Matching tests

A test's identity is its file relative to the root, its `describe` titles, and its title. Both
reports carry these as structured fields (`ancestorTitles`, `title`; Jest's `@jest/test-result`
`FormattedAssertionResult` and Vitest's `JsonAssertionResult`). The joined names are not used:
`fullName` joins with spaces in both runners, so `describe("a b")` and `describe("a", () =>
describe("b"))` would look the same. A title that repeats within the same block is matched by the
order it appears in. File paths are compared after resolving symlinks, with `/` as the separator
and the drive letter lowercased, so Jest's `D:\x` and Vitest's `D:/x` are the same file.
Parametrised titles (`it.each`) are formatted by each runner and can differ. Such a test shows up
once in each runner's "only in" list.

## Buckets

Each runner's result for a test is passed, failed, skipped (`skipped`, `pending`, `todo`,
`disabled`), or missing. Two runner behaviours are read as "failed":

- **The file failed to load.** A test is missing from a runner whose copy of the file failed with
  a message.
- **A `beforeAll` failed.** A test is skipped in a file that failed without any failed test. Vitest
  reports a failing `beforeAll` this way, as a failed file with an empty message and its tests
  skipped.

| Jest → Vitest | bucket |
| --- | --- |
| passed → passed, failed → failed, skipped → skipped | same |
| passed → failed | **regression** (passed under Jest, fails under Vitest) |
| failed → passed | improvement |
| one side skipped, the other ran it | skipped differently |
| test missing from a file the other runner ran | only in Jest / only in Vitest (test) |
| file not in the other runner's test set | only in Jest / only in Vitest (file) |

## What the summary claims

Matching counts do not prove the two runs are equivalent. A Vitest config that collects nothing
has no regressions, and every Jest test then lands in "only in Jest". So the summary states one
claim, with its own floor: **every test that passes under Jest also passes under Vitest.** The claim
holds only when that set is not empty and each test in it has a passing Vitest result. A test that
is skipped, missing or uncollected under Vitest counts against it, just as a failure does.
Differences in which files each runner collects are printed whether or not the claim holds. A run
in which Jest passes no tests is an error, not a pass.

Exit codes: `0` the claim holds; `1` it does not; `2` a runner could not be run, or produced no
report.

## The JSON report

`--json <file>` writes `vitest-native-compare@1`, for attaching to an issue. It contains test
identities (root-relative file, `describe` titles, title), statuses, and error messages. It
contains **no source code**. Messages are cut at the first stack frame, code-frame lines (`> 12 |
…`) are removed, ANSI codes are stripped, the root becomes `<root>` and the home directory becomes
`~`. A message can still contain values the test printed, such as the expected and received values
of a failed assertion, so read it before posting it. Tests with the same result under both runners
are counted, not listed.

## Process hygiene

Each runner is a child process of `node` (no shell, no `.cmd` shim) with a timeout (default 1800
s). On POSIX it runs in its own process group. After the runner exits, the group is killed so that
no worker outlives it. On timeout or Ctrl-C the group gets SIGTERM and then SIGKILL (on Windows,
`taskkill /T /F`). The temporary directories are removed on every path. Variables a parent test
runner sets for its own workers (`VITEST*`, `JEST_WORKER_ID`) are removed from the children's
environment.

## Tests

- `tests/cli-compare.test.ts`: the normaliser and classifier on Jest 30.2.0 and Vitest 5.0.5
  JSON recorded from `tests/fixtures/compare-project`, plus a Windows-path variant. It also runs
  compare end to end with real Vitest and the recorded Jest JSON (`--jest-results`), including the
  snapshot checks.
- The same file runs both real runners when `VN_COMPARE_JEST` points at an installed Jest
  package. This repository does not depend on Jest, so CI does not run that part. With Jest
  available, it also checks that the live reports of both runners put every test in the same
  bucket as the recorded reports do.
