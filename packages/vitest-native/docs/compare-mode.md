# Compare mode: one suite, two runners

`vitest-native compare` runs a project's suite under Jest and under Vitest and lists every test whose
result differs. It is for a team that is trying vitest-native without committing to it yet. The team
does not have to judge the move from a pass count. It gets the tests that pass under Jest and not
under Vitest, grouped by error, plus a report it can attach to an issue.

```sh
npx vitest-native compare [--root <dir>] [--jest-args "<args>"] [--vitest-args "<args>"]
                          [--vitest-config <file>] [--jest-results <file>] [--jest-root <dir>]
                          [--json <file>] [--top <n>] [--timeout <seconds>] [--show-output]
```

## What runs

**Jest** is the project's own Jest (`jest/bin/jest.js`, resolved from the root). Its config is the
one Jest finds by itself, or the one the `test` script names with `--config`. The script's
`--testTimeout`, `--maxWorkers`, `--runInBand`, `--silent` and `--passWithNoTests` are passed too,
because `migrate` maps those into the Vitest config, so both sides get them. The run adds
`--json --outputFile=<temp>`, and `--ci` last. `--jest-results <file>` reads the JSON of a Jest run
made elsewhere, such as in CI, instead of running Jest. Its absolute paths name that machine's
checkout. compare finds that directory from the file names both runners report, or takes it from
`--jest-root`.

**Vitest** is the project's own Vitest (`vitest/vitest.mjs`) with the project's config, found the
way Vitest finds it (`vitest.config.*`, then `vite.config.*`) or named with `--vitest-config`. If
the project has no Vitest config yet, compare uses the config `vitest-native migrate` would write.
That config is executed but never saved: it lives in a temporary directory under `node_modules/`,
and its `import.meta.url` paths are pointed back at the root. The run adds `run --reporter=json`
and `--reporter=default`. The default reporter's output is the only place unhandled errors and
errors during close appear (its JSON says `success: true` for those), and it carries the engine
vitest-native reports.

The two runs happen one after the other, not in parallel, so one does not slow the other down.

`--jest-args` and `--vitest-args` accept an allow-list: worker, timeout, project, shard, name and
path filters, `--silent`, `--watchAll=false` and the like (`JEST_ARGS`/`VITEST_ARGS` in
`src/cli/compare-run.ts`). Anything else is refused. An earlier deny-list let through `-ut .` (Vitest's
`-u` in a cluster of short flags) and Jest's `--ci false`, and both write snapshots.

## Snapshots: compare writes nothing

Measured with Vitest 5.0.5: under `CI=true`, which makes Vitest's snapshot mode `none`, Vitest still
rewrote the header of every Jest `.snap` file it read to `// Vitest Snapshot v1`, which Jest then
refuses to read. The keys differ too (`a > b 1` against `a b 1`; `migrating-from-jest.md`, section
2d). And a project's own settings can ask for writes: `test.update: true`, the `UPDATE_SNAPSHOT`
environment variable, or a `resolveSnapshotPath` that points at Jest's `__snapshots__/`. So:

- Both runs set `CI=true` without `UPDATE_SNAPSHOT`. Jest gets `--ci` last.
- Vitest loads a wrapper config. The wrapper imports the project's config, which is never edited,
  and sets `update: false` after it.
- **Every** snapshot file Vitest resolves is read from a copy in an isolated directory. That
  covers files resolved through the project's `resolveSnapshotPath`, an inline project's, or
  `__vitest_snapshots__/` (the recipe) when there is none. Only a file with Vitest's header is
  copied. Projects listed by config-file path cannot be wrapped.
- Every file under the root except `node_modules/` and `.git/` is stat'ed before Jest runs and
  after Vitest runs. Any added, changed or removed file fails the run (exit 2) and is listed. The
  check also covers inline snapshots (written into test sources) and `toMatchFileSnapshot` outputs.

A `.snap` test with no Vitest snapshot fails under CI. Only then does the report say so, with the
recipe: give Vitest its own directory first, then record. Following "run `vitest run`" without the
recipe would rewrite Jest's files. A test counts as a `.snap` case when its key, in Jest's
spelling, is in Jest's `.snap` file. Inline and file snapshots fail with the same message, but
have no such key.

## Matching tests

A test's identity is its file relative to the root, its `describe` titles, and its title. Both
reports carry these as structured fields (`ancestorTitles`, `title`; Jest's `@jest/test-result`
`FormattedAssertionResult` and Vitest's `JsonAssertionResult`). The joined names are not used:
`fullName` joins with spaces in both runners, so `describe("a b")` and `describe("a", () =>
describe("b"))` would look the same. File paths are compared after resolving symlinks, with `/` as
the separator and the drive letter lowercased, so Jest's `D:\x` and Vitest's `D:/x` are the same
file.

**Copies.** Several results can share one identity: a repeated title, Vitest `test.projects`,
Jest `projects`. They are one test that passes only if every copy passed. Pairing copies by order
let a passing copy stand for a failing one when the runners ran them in another order
(`test.concurrent`, Jest's `randomize`).

**Titles that differ.** Each runner formats parametrised titles (`it.each`) itself: `%s` of an
object, `%p`, `$var`, `%%`, tagged templates. Tests only one runner named are therefore matched in
order within the same file and `describe` block, as long as the titles share their template: the
first word and at least three characters. The report lists every such pair, Jest's title next to
Vitest's.

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
has no regressions, and every Jest test then lands in "only in Jest". A suite can also pass every
test and still fail: an unhandled rejection, `process.exit` in a test file, or a globalSetup
teardown that throws makes `vitest run` exit 1 while its JSON shows nothing wrong. So the summary
states one claim, with its own floor: **every test that passes under Jest also passes under Vitest,
and `vitest run` exits 0.** The claim holds only when that set of tests is not empty and each test
in it has a passing Vitest result. A test that is skipped, missing or uncollected under Vitest counts
against it, just as a failure does. When Vitest exits non-zero the summary lists why: failing tests
(including ones Jest did not run, or that fail under Jest too), unhandled errors, errors during
close, or an exit the report cannot explain. The headline names the engine vitest-native
reported. If none was reported, the summary says so, because the config may not load
`reactNative()` at all. Differences in which files each runner collects are printed whether or not
the claim holds.

Exit codes:

- `0`: the claim holds.
- `1`: it does not.
- `2`: a runner could not run or wrote no report, Jest passed no test, or the run changed a file
  in the project.
- `130`: compare was interrupted (Ctrl-C, SIGTERM, SIGHUP).

## The JSON report

`--json <file>` writes `vitest-native-compare@1`, for attaching to an issue. It contains test
identities (root-relative file, `describe` titles, title), statuses, and error messages. Removed
from messages:

- ANSI codes.
- The stack, cut at the first `    at ` or `❯` frame.
- Code-frame lines in each runner's style: `> 12 |`, `12| `, `12 │`, box drawing, `^` markers.
- Node's `file:line` + source line + `^^^` blocks (Jest's "Details:").
- Absolute paths. The root becomes `<root>`, the temp directory `<tmp>`, the home directory `~`, and
  any other absolute path `<path>`. This covers Windows, JSON-escaped and file-URL spellings.

What is **not** guaranteed: a message keeps whatever a test put in its own error, such as received
values, an environment dump, or file contents it read. Read the report before posting it. Tests
with the same result under both runners are counted, not listed.

## Process hygiene

- **Watchdog.** Each runner is started through a small watchdog: `node -e`, with no shell and no
  `.cmd` shim, over an IPC channel. The timeout defaults to 1800 s.
- **Process group.** On POSIX the watchdog leads its own process group. After the runner exits,
  the group is killed so that no worker outlives it.
- **Timeout and signals.** On timeout, Ctrl-C, SIGTERM or SIGHUP the group gets SIGTERM, then
  SIGKILL. On Windows, `taskkill /T /F` ends the tree.
- **compare dies uncleanly** (SIGKILL, a crash). The IPC channel closes. The watchdog stops the
  runner, removes compare's temporary directories and kills its group.
- **Windows orphans.** On Windows there are no groups, so after the runner exits the watchdog
  stops processes the runner started that outlived it, found by parent id and start time. This
  path is not exercised by the tests.
- **Pipes held open.** A process a test starts in a session of its own (`detached: true`) is the
  test's, as it is under the runners, and compare does not stop it. If it holds the output pipe,
  compare stops waiting 2 s after the runner exits.
- **Environment.** Variables a parent test runner sets for its own workers (`VITEST*`,
  `JEST_WORKER_ID`) are removed from the children's environment, as is `UPDATE_SNAPSHOT`.

## Tests

- `tests/cli-compare.test.ts`:
  - The normaliser and classifier on Jest 30.2.0 and Vitest 5.0.5 JSON recorded from
    `tests/fixtures/compare-project`, including the `it.each` title formats, plus a Windows-path
    variant.
  - compare end to end with real Vitest and the recorded Jest JSON (`--jest-results`).
- `tests/cli-compare-edges.test.ts`: one executed case per finding of an adversarial review.
  - The verdict: unhandled rejections, `process.exit`, teardown errors, Vitest-only failing files,
    projects, ordered duplicates.
  - Snapshots: a shared directory, `update: true`, `UPDATE_SNAPSHOT`, inline and file snapshots,
    argument clusters.
  - The report's stripping.
  - Processes: a held pipe, compare SIGKILLed, SIGHUP.
  - Foreign roots.
- With `VN_COMPARE_JEST` pointing at an installed Jest package, the first file also runs both real
  runners and checks that their live reports agree with the recorded ones. This repository does
  not depend on Jest, so CI runs only the recorded-Jest path.
