# Configuration-axis matrix

A project chooses several things our fixtures never varied. A monorepo migration report
(October 2026, Vitest 4.1.11, 286 files) found about sixteen defects. Nearly all of them sat on
one or two of those choices, and every gate we had was green. This matrix varies the choices
and runs a small set of behaviour probes on each combination, so the next defect of this kind
fails our CI and not a user's migration.

Code: `validation/config-axes/` (fixture, probes, generator, harness, known-failing list).
Workflow: `.github/workflows/config-axis-matrix.yml`. Unit tests for the machinery:
`tests/config-axes.test.ts`.

## The axes, and the defect that sat on each

| Axis           | Values                         | Defect it hid (report item → fixing PR)                                                                                                                                                               |
| -------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest globals | off (Vitest's default), on     | RNTL cleanup never ran without a global `afterEach` (#17 → #342)                                                                                                                                      |
| `jest` global  | jest-compat on, off            | `findBy*` under `vi.useFakeTimers()` timed out without a global `jest` (#18 → #342)                                                                                                                   |
| RNTL           | 12, 13, 14                     | nested `<Text>` unqueryable on 12/13 under native (#16 → #341); a recoverable React error exited 1 on 12/13 (#13 → #343)                                                                              |
| Engine         | native, mock                   | string/regex aliases into workspace source: two store instances, "Cannot find module", `import.meta` SyntaxError (#1 → #344); ESM default import of `__esModule` CommonJS (#15 → #339)                |
| Vitest         | 4, 5                           | under hot, Vitest 4.1 replays another file's factory for an automock (#14 → #338)                                                                                                                     |
| Hot runtime    | off, on                        | the same (#14), and per-file state in general: a `jest.mock` of a React Native module to `null` lost the next file from every reporter (→ #350)                                                       |
| Install layout | hoisted (npm), isolated (pnpm) | `navigation: false` fails in isolated installs: transitive deps not compiled (#5 → #348); a library whose pnpm store directory names worklets loses its `.native` files, reanimated included (→ #349) |
| jest-compat    | off, on                        | partial-mock store split by import order (#10 → #345); fake-timer options dropped (#8 → #340); Error equality (#7 → #346)                                                                             |

Two constraints remove combinations that do not exist. The hot runtime is a native-engine pool.
jest-compat is documented as `jestCompatSetup` + `globals: true`: `jestMockTransform` hoists
`jest.mock` to a global `vi`, so without globals a partial mock fails with `vi is not defined`.
That error is itself worth a clearer message (see Open questions).

## What existing CI already covered

| Cell            | Where                                                                                   | Notes                                                                      |
| --------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| RNTL 12 / 13    | `ci.yml` back-compat legs (ubuntu, Node 22.13)                                          | native + hot suites, but every native config there sets `globals: true`    |
| Vitest 4        | RN matrix `v4` column (RN 0.81, 0.88); `packed` cell "Vitest semantics, Vitest 4 floor" | native + hot on RNTL 14 only; the semantics gate has no RNTL               |
| Hot on          | `ci.yml` every leg; RN matrix every cell                                                | `globals: true`, RNTL 14 (12/13 in `ci.yml`)                               |
| Isolated layout | `consumer-tests/monorepo-pnpm` (packed, pnpm)                                           | native, RNTL 14, `globals` off — but no RNTL cleanup, timer or alias probe |
| Mock engine     | `bun run test` (globals off), `consumer-tests/mock-rntl14`                              | RNTL 14 only on the packed side                                            |
| jest-compat     | `consumer-tests/bare`, `tests-native/vitest.hot-jest-compat.config.mts`                 | `globals: true`; RNTL 12 (bare)                                            |

So each axis was covered somewhere, but almost never two at a time. The monorepo report's
defects mostly need two: globals off × any RNTL test that renders twice, RNTL 12/13 × native,
Vitest 4 × hot, isolated × a preset switched off.

## Design

**Probes, not suites.** Each probe is one small test file, or a pair of files, that asserts the
correct behaviour: what Jest, a device or Vitest's own semantics would give
(`validation/config-axes/probes.mjs`). Each one names the report item it was written from. A
probe's `requires` says where it can run at all, and `observes` where it can also observe its
defect; both cover every axis, install axes included. Where it cannot run it is `n/a`: the
jest-compat probes need jest-compat, the hot pairs `hot: on`, and the #349 probes the native
engine. Where it runs but cannot observe its defect, it still runs, because the behaviour it
asserts is still correct there and can still regress. A pass there is reported as
`unobserved`, not counted as evidence, and a failure is a REGRESSION. The automock pair cannot
observe its defect on Vitest 5, which has no mock placeholder to replay. recoverable-error
cannot on RNTL 14, whose renderer never takes that path. The #349 probes cannot in a hoisted
layout, because only pnpm names a store directory after a peer. The alias, interop and
nested-Text probes cannot under the mock engine, which has no Node-side aliasing, CommonJS
interop or `RCTVirtualText` to get wrong. The recoverable-error probe
runs in its own process, because its verdict is the exit code. So does the #350 pair, because
the defect loses every later file in the worker. The banner probe reads the run's output.

**Every run is accounted for, whatever its probes did** (`validation/config-axes/accounting.mjs`).
Each Vitest process has three witnesses: the process (exit code, signal, timeout), Vitest's JSON
report, and a small reporter in the fixture (`accounting-reporter.mjs`) that records what
`onTestRunEnd` sees: the modules Vitest collected and the run's unhandled errors. The JSON report
keeps neither; #350 dropped a third of a suite from it with no error attached. A run has a
problem when a file it was given has no result in either witness, when an unhandled error was
reported, when it crashed or timed out, or when its exit code is not what its results imply
(1 with nothing failed, 0 with something failed, or a JSON `success` that disagrees). In the
shared run those problems belong to no probe and are reported as `ERROR`, so no known failure
can absorb them. In a run of one probe they are that probe's own failure lines.

**Install axes per job, runtime axes per run.** A job installs one combination of Vitest, RNTL
and layout from the registry, with vitest-native from the packed tarball. npm workspaces give a
hoisted layout and pnpm workspaces an isolated one. The workspace has an app, four workspace
libraries aliased to their source by string and regex, and a vendored ESM package. The job then
runs every allowed runtime combination (engine × globals × hot × jest-compat: 9 runs) through
`AXIS_*` variables read by one `vitest.config.mts`. A run is one more Vitest process over the
same `node_modules`: measured at 1–3 s warm and 7–11 s for the first.

Two extra runs (`extraRuns` in `axes.json`) cover settings that no axis value spells.
`defaults` leaves `engine` and `hotRuntime` unset, as a new project has them. It is judged as
what `auto` resolved to (`resolve`): the harness reads the engine and the hot runtime from the
banner of a run over no files, then judges the run as those values. Locally it chose the hot
runtime. It leaves out the hot pairs, since `auto` chooses its own worker count. `hot, 2 workers` runs the hot runtime with `maxWorkers: 2`, as real suites do, and
leaves out the hot pairs, which need one worker.

Installs have no lockfile. Each job resolves the ranges in `axes.json` (and this package's
pins) a week behind the registry (`npm --before`, pnpm's `minimumReleaseAge`). So a cell can go
red because a dependency moved, not because of the change under test: rerun the last green
commit before blaming a merge. pnpm itself is pinned exactly (`sh.mjs`), fetched by `npx`, and
added to no manifest. Each install has its own time budget (10 minutes), and a step that runs
out reports "timed out" instead of the job being killed.

**Pairwise on pull requests, full on schedule.** Installs are the expensive part, so pull
requests run a two-way cover of the install axes (`cells.mjs`): 6 jobs, so every
(Vitest, RNTL), (Vitest, layout) and (RNTL, layout) pair is installed once. Every runtime
combination runs on each of them. Pushes to main, the weekly schedule, manual runs, and pull
requests that change the matrix itself run all 12 installs × 9 runs (plus the extra runs). What
a pull request changed is a three-dot diff, so changes main made since the branch point do not
count. The generator is
deterministic, and `tests/config-axes.test.ts` asserts that every pair of values of any two axes
is covered.

**Known failures are explicit, and the list can only shrink.**
`validation/config-axes/known-failing.json` lists each probe that fails today on main. Each
entry gives the axis values the probe fails on, the PR that fixes it, and why. The harness
(`verdict.mjs`) judges each result as follows:

- A pass that is not listed is fine.
- A listed failure is reported as "known" with its fixing PR, and the cell stays green, only
  when it fails the way the entry says. Each entry has a `failure` regex for the bug itself.
  Failure lines carry the error's cause chain from the accounting reporter, since the JSON
  report drops it. Vitest's bare "There was an error when mocking a module" says nothing, and
  a signature on it once absorbed a TypeError in the factory. An optional `consequences`
  regex matches lines the bug causes but that do not identify it, such as the file #350 loses
  after the restore throws, or the exit code. Those lines are accepted only when the entry's
  own `failure` matched in the same run, so a lost file with no error beside it is never
  "known". `consequences` may match only lost-file and exit-code lines, never an assertion, a
  TypeError or an unhandled error, and it cannot account for every file of the probe being
  lost. Every failure line must be accounted for. A signature may not match any of its
  probe's generic lines (`genericFailureLines` in `verdict.mjs`): a crash, a lost or unrun
  file, Vitest's bare mocking error, an unrelated TypeError or unhandled error, each with the
  probe's own file names.
- Any other failure is a **REGRESSION**, and the cell goes red. That includes a listed probe
  failing some other way: a SIGSEGV or a TypeError in a probe whose entry expects an
  assertion message is not the known bug.
- An entry is **STALE**, and the cell goes red, when it applies to the run but its `failure`
  matches no line: the probe passes, or fails only for another entry's reason. Staleness is
  judged per entry, so two entries on one probe cannot hide a fixed bug and absorb its later
  regression. The remedy is to delete the entry. So a fix PR must delete its
  own entry. An entry that matches no possible run (it could never go stale) fails the unit test.

Entries were derived from local runs, not from the report's prose, and each signature is the
failure observed there. Requiring signatures found one entry that had been absorbing a different
failure: under the mock engine, `partial-mock-store` fails because the mock factory throws, not
because the store is split. It now has its own entry. Three cases came out wider
than the report says. RNTL 12 also hits #13 (the report named 13). `findBy` fails with
globals on as well, whenever there is no jest-compat. The string-alias split does _not_ show
with jest-compat on.

**Not required, yet.** `Config-axis verdict` reports on every pull request but is not in
branch protection (required contexts stay `CI verdict`, `RN matrix verdict`, `Analyze`,
`CodeQL`). The plan is to make it required once it is calibrated. That means the first full
CI runs on Vitest 4 and real npm and pnpm installs have confirmed or corrected every entry and
signature, and a few weeks of scheduled runs have stayed green except for real changes. Making
it required is the maintainer's decision.

## Cost

| Scope                   | Jobs | Runs | Per job (estimate)                                                    |
| ----------------------- | ---- | ---- | --------------------------------------------------------------------- |
| pull request (pairwise) | 6    | 54   | setup + build ≈ 1.5 min, registry install ≈ 1–1.5 min, 9 runs ≈ 1 min |
| main / weekly (full)    | 12   | 108  | the same                                                              |

Ubuntu runners in parallel, so wall time is about 4–5 min per pull request. That is under
the Windows full gate, which is the critical path. The per-run figure is measured locally. The
install figure is extrapolated from the `packed` cells (consumer installs about 3 min for eight
fixtures) and is unmeasured until the first CI run.

## Gaps (deliberate, for now)

- **EXPO_OS** (#4 → #343): it needs `expo` to resolve, which means installing the Expo SDK into
  every cell. It belongs in `consumer-tests/expo`, not here.
- **Screens header and `navigation: false` in isolated installs** (#6 → #341, #5 → #348): both
  need React Navigation and react-native-screens in the workspace. Adding them to the isolated
  cells is the next probe to write.
- **Real npm and pnpm installs were not run locally** (local verification may not install).
  Every cell ran locally on Vitest 5 and on a Vitest 4.1.11 copy linked with `--link-deps`, with
  RNTL 12.9, 13.3 and 14.1, in both a linked (hoisted-shaped) layout and the pnpm-shaped store.
  The isolated-layout entries (#349) were observed in that pnpm-shaped store, not in a pnpm
  install. Expect the first CI run to calibrate a few entries and signatures.
- **`findBy*` under `vi.useFakeTimers()` without a global `jest` (#18)** has no fixing pull
  request: #342 documents it as a limitation. Its entry names #342 and says so; it will not go
  stale when #342 merges.
- **Node and OS** are not axes here. `ci.yml` covers them.

## The matrix and the bug museum

The bug museum (`validation/bug-museum/`, being built on `feat/bug-museum`) keeps one exhibit
per bug: its minimal reproduction, a control that removes the bug's precondition, and columns
for main, the fix, and the build before the fix. The matrix asks a different question: does
one behaviour hold on every combination of Vitest, RNTL, install layout, engine, globals, hot
runtime and jest-compat? The two split the work this way, so neither repeats the other:

- A bug gets a matrix probe only when it sat on a configuration axis. The probe then runs on
  every cell, which an exhibit does not do.
- Every other variant of a bug lives only in the museum, as an exhibit. That covers alias
  forms beyond string and regex, ESM interop shapes beyond the default-only form, the v2
  per-file-world hot bugs, the #351 library-mock bugs, worker-count configuration (#347),
  `EXPO_OS` and the native-stack header.
- Where both exist, the probe and the exhibit name the same fixing PR, so a fix makes the
  probe's entry STALE and moves the exhibit's "main" column together.

| Matrix probe (axes varied)                                 | Museum exhibit (bug at its repro)                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| rntl-auto-cleanup                                          | env-rntl-auto-cleanup, env-rntl13-auto-cleanup, env-rntl-cleanup-reexport-hot |
| rntl-findby-fake-timers                                    | env-rntl-findby-fake-timers                                                   |
| rntl-nested-text                                           | pre-rntl12-nested-text, pre-rntl13-nested-text                                |
| recoverable-error                                          | env-recoverable-error                                                         |
| partial-mock-store                                         | own-partial-mock-store                                                        |
| aliased-sibling-string, -regex, aliased-source-import-meta | own-alias-string, own-alias-regex, own-alias-import-meta                      |
| esm-default-interop                                        | res-esm-default-interop                                                       |
| jest-fake-timer-options                                    | env-jest-fake-timer-options                                                   |
| jest-error-equality                                        | env-jest-error-equality                                                       |
| hot-automock                                               | pfs-hot-automock-vitest4                                                      |
| hot-rn-module-mock                                         | pfs-hot-dropped-file                                                          |
| native-ext-peer, reanimated-render                         | res-pnpm-native-ext-peer, res-pnpm-reanimated-render                          |
| preset-banner                                              | pre-banner-names-presets                                                      |

## Running it locally

```bash
bun run build
CELL='{"vitest":"5","rntl":"14","layout":"isolated","runs":[{"engine":"native","globals":"off","hot":"off","jestCompat":"off"}]}'
# Without installing anything: link this package's node_modules (bun's isolated store).
node validation/config-axes/run.mjs --cell "$CELL" --link-deps node_modules
# Another RNTL: copy an installed one in.
node validation/config-axes/run.mjs --cell "$CELL" --link-deps node_modules --rntl <dir>/@testing-library/react-native
```

With `"layout":"isolated"` the packages pnpm names after their peers (`axis-peer-lib`,
reanimated) are copied into a pnpm-shaped store directory, so the #349 class shows locally.
Vitest 4: link a node_modules that has it, and a vitest-native copy (`package.json` and
`dist/`) placed where it resolves that Vitest, not this package's Vitest 5. Otherwise the hot
runtime refuses the mix (`HOT_RUNTIME_UNAVAILABLE`):
`--link-deps <v4 node_modules> --vitest-native <v4 node_modules>/.vn-copy`.
`--keep` keeps the materialised workspace, `--only a,b` limits the probes, and `AXIS_DEBUG=1`
prints each run's output. Without `--link-deps` the harness installs from the registry, as CI
does.
