# Bug museum

One minimal, runnable repro ("exhibit") for every real bug found in October 2026:
the defects found in migration testing, #349-#351, the four hot-runtime cross-file leaks, the M0 G3 per-file resolution cost, and the shapes the
adversarial reviews of #339-#353 found. Each exhibit asserts the CORRECT behaviour (what
Jest, a device or Vitest's own semantics give), so it fails on any build that has the bug.

It serves two purposes:

1. a permanent regression suite for the v1 runtime;
2. the acceptance test for the planned v2 runtime, which must pass every exhibit by
   construction.

[STATUS.md](STATUS.md) has the measured table: exhibit, class, main today, with its fix.

## Layout

```
exhibits.json          one entry per exhibit: class, fixing PR, signature, installs, status
exhibits/<id>/         README.md (bug, source, class, expected) + its own config and tests
columns.json           the commit SHA each column's ref resolved to when STATUS.md was measured
run.mjs                runs every exhibit, or a filter, against a built vitest-native
run-columns.mjs        builds every column's ref and runs its exhibits, one at a time
build-ref.mjs          builds vitest-native at a git ref, cached by commit SHA
status.mjs             checks every verdict's SHA, then renders STATUS.md and exhibits.json
compare.mjs            compares one run's verdicts with main's recorded ones (the CI check)
lib/verdict.mjs        "the bug" or "unexpected", judged by ../config-axes/verdict.mjs
lib/lines.mjs          a run's failure lines (file: message, no titles)
lib/build-info.mjs     the SHA a build directory was built from, checked by content hash
lib/hash.mjs           content hashes of a build (package.json + dist/) and of an exhibit
lib/materialise.mjs    builds an exhibit's workspace from this repository's install
lib/axes.mjs           why a verdict run with --ownership or --node-mocks is not a STATUS.md column
```

## Running

```sh
bun run build                                   # the exhibits run against dist/
node validation/bug-museum/run.mjs              # every exhibit against this build
node validation/bug-museum/run.mjs --only pfs-hot-use-id,env-expo-os
node validation/bug-museum/run.mjs --class ownership
node validation/bug-museum/run.mjs --build ../other-checkout/packages/vitest-native
node validation/bug-museum/run.mjs --control    # each exhibit with its bug's precondition removed
node validation/bug-museum/run.mjs --ownership resolver   # with experimental.ownershipModel: 'resolver'
node validation/bug-museum/run.mjs --ownership resolver --node-mocks on   # and experimental.nodeMocks: true
MUSEUM_DEBUG=1 node validation/bug-museum/run.mjs --only <id>   # Vitest's own output too
```

Each exhibit prints `PASS`, `FAIL (the bug)`, `FAIL (unexpected)` or `N/A` with the
reason. The process exits 1 when any exhibit fails, and also when any is N/A (an exhibit
that could not run is not evidence) unless `--allow-na` is given. On today's main the suite
is red by design: STATUS.md lists what is expected to fail until each fix lands.

### The `ownershipModel` axis

`--ownership resolver` runs every exhibit with `experimental.ownershipModel: 'resolver'`
(ownership track A, ADR-0004/0005), so a build can be judged in both flag states. The
installed copy of vitest-native gets a main entry that re-exports the build's and adds the
option to every `reactNative()` call; no exhibit is edited, and the build is not touched.
An exhibit whose `reactNative()` never saw the option fails, so a run cannot pass with the
flag silently off. Before running anything, `../config-axes/ownership.mjs` asks the build
whether it reads the flag: it must accept the value and reject an invalid one by name. A
build that does not (main before #370) records every exhibit N/A, "flag not supported by
this build", and exits 0. Verdicts carry `ownershipModel`, and `status.mjs` refuses them:
STATUS.md records the flag off. The default (`off`) leaves the option unset, as before.

### The `nodeMocks` axis

`--node-mocks on` runs every exhibit with `experimental.nodeMocks: true`, and `--node-mocks
off` with `false` spelled out; without the flag the option stays unset. With `--ownership`,
both entries go into one `experimental` object (`../config-axes/node-mocks.mjs`
`experimentalEntries`), so `--ownership resolver --node-mocks on` is `'resolver'` with
`nodeMocks` on, which `--ownership` alone cannot express. The wrapper and its check are the
ownership axis's: an exhibit whose `reactNative()` never saw the entries fails.

Before running anything, the build is asked whether it reads the flag: it must accept the
requested value and reject a value that is not a boolean, naming `nodeMocks`. A build that
warns about `experimental`, rejects `nodeMocks` as an unknown option, or accepts any value
records every exhibit N/A, "flag not supported by this build", and exits 0. A build that
reads both flags but rejects the combination records every exhibit N/A as "combination not
runnable with this build", with the build's own message: today that is `--ownership
resolution --node-mocks off`, since `'resolution'` turns `nodeMocks` on. Verdicts carry
`nodeMocks`, and `status.mjs` refuses them.

A run passes only when three witnesses agree (the config-axis matrix's
`../config-axes/accounting.mjs` and its accounting reporter): Vitest exited 0, the JSON
report has passing tests for every test file of the exhibit, and the reporter saw no
unhandled error and no lost file. An exhibit may add `check.mjs` (a check of the run's
output, such as the banner) or `runs` (several Vitest runs).

### The bug, or something else

A failure is `FAIL (the bug)` only when the config-axis matrix's verdict rules
(`../config-axes/verdict.mjs`, the one owner of them; `lib/verdict.mjs` adapts an exhibit to
a probe with one known-failing entry) say so:

- every exhibit has a `bugSignature`: a regex for its bug's OWN failure line, anchored to
  the exhibit's file. It may not match any generic line (a crash, a lost file, a timeout,
  an unrelated TypeError or assertion: `genericFailureLines` plus the museum's own), which
  run.mjs checks before running anything;
- `consequences` (optional) are lines the bug causes without identifying itself (a file
  the run lost, an exit code), accepted only beside a line the signature matched;
- EVERY failure line must be the signature or a consequence, or the verdict is
  `FAIL (unexpected)`. An exhibit whose every file is lost is unexpected, unless it
  declares `bugPreventsEveryFile`: a string saying why, allowed only when the signature is
  anchored on an unhandled error tied to no test file (`^unhandled error: ` or
  `^run N: unhandled error: `), the shape of a run rejected before any file starts;
- failure lines are `file: message`, never the test's title, so a signature cannot match
  the exhibit's own description of what it expects. Where a bare message would be
  generic, the exhibit's assertion carries a message (`expect(x, "…")`) that names it.

An unrelated defect prepended to `dist/native/setup.mjs` makes every exhibit it reaches
read `FAIL (unexpected)`, including the regression guards that pass on main.

### Where the dependencies come from

Nothing is installed. Each exhibit is copied to a fresh directory whose `node_modules`
links this package's installed dependencies (bun's isolated store), copies vitest-native
from the build under test (`package.json` + `dist`, as an install would), copies the
exhibit's `vendor/*` packages and links its workspace members. Expo's packages, which
this package installs for its own Expo tests, are linked only into an exhibit whose
`package.json` declares `expo`: every other exhibit is a bare React Native project, so a
build from before #432 fails it as its own bug and not on Expo's runtime. Install axes this
repository lacks are assembled from local copies (`requires` in exhibits.json):

- `rntl: 13`: copied from a bun store that has it (default
  `~/dev/vitest-react-native/node_modules/.bun`, override `VN_MUSEUM_RNTL_STORE`);
- `layout: pnpm`: the `pnpmShaped` packages moved into a pnpm-shaped store directory
  named after their peers (`.pnpm/<name>@<v>_<peer>@<v>/node_modules/<name>`).

`installedCopies` (`{ "<path in the exhibit>": "<package>" }`) puts a real copy of an
installed package inside the exhibit, as a monorepo app with its own copy of React has.

When a local copy is missing the exhibit is `N/A: requires-CI`, and the run exits 1
unless `--allow-na` is given.

## In CI

`.github/workflows/bug-museum.yml` runs every exhibit against the packed package on pull
requests that touch the package, on Node 22.22.3, and `compare.mjs` compares each verdict
with the main verdict exhibits.json records. Since open bugs fail on main by design, the
check fails only when a pull request regresses an exhibit: one that passes on main fails,
or one that fails as its bug fails some other way. An exhibit that now passes is listed,
to be recorded with `run-columns.mjs` and `status.mjs`.

The check is advisory, not required; the workflow's header says when it becomes one. It
skips the exhibits that need RNTL 13 (N/A there), and reports
`cfg-group-conflict-fallback` as inconclusive when hot auto picks per-file isolation on
the runner.

## Proving an exhibit is load-bearing

An exhibit that passes on a buggy build is useless. Each is proven one of four ways
(STATUS.md, Proof column):

- **fix proven**: fails as its bug on main (or, for a bug main cannot reach, on its
  `buggyRef`), and passes on the build of its fix branch (`fixRef`);
- **guard proven**: a regression a fix PR introduced; passes on main, fails on that PR's
  build (`buggyRef`);
- **landed proven**: the fix is on main; fails on the build before it (`preFixRef`);
- **open**: no fix exists yet (or the PR does not fix this shape); fails on main, and its
  `control` (edits that remove the bug's precondition, such as `hotRuntime: false` for a
  hot leak) passes, showing the exhibit can pass.

`run-columns.mjs --results <dir> [--cache <dir>] [--max-load 4]` measures every column:
it builds each ref with `build-ref.mjs` (`git archive`, `bun install --frozen-lockfile`,
`bun run build`, cached by commit SHA; `.museum-build.json` records the SHA and a hash of
package.json plus dist/), runs its exhibits, and writes `columns.json`. Every verdict
carries the SHA of the build it ran on and a hash of the exhibit it ran. A build counts as
verified only while its files still match the recorded hash, so a build edited after it
was built, by hand or in the cache, is unverified.
`status.mjs --results <dir>` refuses to write anything when a verdict is missing, ran on an
unverified build (a working tree's own dist), ran on a SHA other than its column's in
`columns.json`, or was measured on an earlier version of its exhibit; otherwise it replaces
STATUS.md and exhibits.json together.

## Classes

| Class                | Where the bug lives                                                                    |
| -------------------- | -------------------------------------------------------------------------------------- |
| ownership            | which module system (Node or Vite) evaluates a file; two copies of one module          |
| env-contract         | the environment a test file sees: globals, timers, error reporting, RNTL wiring        |
| per-file-state       | what survives from one test file to the next in a worker (the hot runtime)             |
| presets              | a mock of a library (preset, or a library's own Jest mock) diverging from the real one |
| transform/resolution | how a file is compiled or a request resolved (interop, extensions, pnpm paths)         |
| harness              | how a test must be written to hold across RNTL majors                                  |
| config               | how the plugin reads and writes Vitest's configuration                                 |

## Not exhibited, and why

- **V8 compile-cache growth under hot** (one entry per `?vnhot=N` stamp):
  DROPPED. It could not be made to fail on main `0f2400e`: two runs over the same files,
  and a run of two files followed by a run of four over the same installed ES module,
  both added 0 entries (495 -> 495). Either it changed since rc.4 or it needs a
  larger suite's shape; a counter exhibit that passes on main would prove nothing.
  #376 has since kept the compile cache off in hot workers that re-evaluate ES modules.
- **Snapshot key format differs from Jest's**: documentation only; the
  behaviour is Vitest's, and #340 documents the coexistence recipe.
- **The automatic worker cap should scale with cores**: a performance
  proposal measured only on bake-offs; the deterministic half (explicit counts are
  honoured) is `cfg-explicit-max-workers`.
- **The hot worker re-reads the filesystem per file**: its deterministic
  form is the read counter in `pfs-hot-library-mock-cost`.
- **The `compare` command's review blockers (#352)** and the **verification-harness
  gate bugs** (check:size floors, unguarded cache keys): defects of unmerged tooling and
  of CI gates, not of the runtime; the harness audit's mutation scripts cover the gates.
