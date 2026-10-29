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
lib/verdict.mjs        "the bug" or "unexpected", judged by ../config-axes/verdict.mjs
lib/lines.mjs          a run's failure lines (file: message, no titles)
lib/build-info.mjs     the SHA a build directory was built from, checked by content hash
lib/hash.mjs           content hashes of a build (package.json + dist/) and of an exhibit
lib/materialise.mjs    builds an exhibit's workspace from this repository's install
lib/vitest4.mjs        assembles Vitest 4.1.11 from bun's cache for the exhibits that need it
```

## Running

```sh
bun run build                                   # the exhibits run against dist/
node validation/bug-museum/run.mjs              # every exhibit against this build
node validation/bug-museum/run.mjs --only pfs-hot-use-id,env-expo-os
node validation/bug-museum/run.mjs --class ownership
node validation/bug-museum/run.mjs --build ../other-checkout/packages/vitest-native
node validation/bug-museum/run.mjs --control    # each exhibit with its bug's precondition removed
MUSEUM_DEBUG=1 node validation/bug-museum/run.mjs --only <id>   # Vitest's own output too
```

Each exhibit prints `PASS`, `FAIL (the bug)`, `FAIL (unexpected)` or `N/A` with the
reason. The process exits 1 when any exhibit fails, and also when any is N/A (an exhibit
that could not run is not evidence) unless `--allow-na` is given. On today's main the suite
is red by design: STATUS.md lists what is expected to fail until each fix lands.

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
exhibit's `vendor/*` packages and links its workspace members. Install axes this
repository lacks are assembled from local copies (`requires` in exhibits.json):

- `rntl: 12 | 13`: copied from a bun store that has them (default
  `~/dev/vitest-react-native/node_modules/.bun`, override `VN_MUSEUM_RNTL_STORE`);
- `vitest: 4`: Vitest 4.1.11 and its `@vitest/*` packages from bun's global cache;
- `layout: pnpm`: the `pnpmShaped` packages moved into a pnpm-shaped store directory
  named after their peers (`.pnpm/<name>@<v>_<peer>@<v>/node_modules/<name>`).

When a local copy is missing the exhibit is `N/A: requires-CI`, and the run exits 1
unless `--allow-na` is given.

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
