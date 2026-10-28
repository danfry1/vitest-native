# Bug museum

One minimal, runnable repro ("exhibit") for every real bug found in the October 2026
migration-report period: the monorepo migration report's issues, #349-#351, the four
hot-runtime cross-file leaks, the M0 G3 per-file resolution cost, and the shapes the
adversarial reviews of #339-#353 found. Each exhibit asserts the CORRECT behaviour (what
Jest, a device or Vitest's own semantics give), so it fails on any build that has the bug.

It serves two purposes:

1. a permanent regression suite for the v1 runtime;
2. the acceptance test for the planned v2 runtime, which must pass every exhibit by
   construction.

[STATUS.md](STATUS.md) has the measured table: exhibit, class, main today, with its fix.

## Layout

```
exhibits.json          one entry per exhibit: class, fixing PR, installs, measured status
exhibits/<id>/         README.md (bug, source, class, expected) + its own config and tests
run.mjs                runs every exhibit, or a filter, against a built vitest-native
status.mjs             records verdicts into exhibits.json and renders STATUS.md
lib/materialise.mjs    builds an exhibit's workspace from this repository's install
lib/vitest4.mjs        assembles Vitest 4.1.11 from bun's cache for the exhibits that need it
lib/accounting*.mjs    the three-witness run accounting (copied from the config-axis matrix)
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

Each exhibit prints `PASS`, `FAIL (the bug)` (the failure matches its recorded
`bugSignature`), `FAIL (unexpected)` (it fails some other way: on a buggy build that means
the exhibit no longer reaches its bug) or `N/A` with the reason. The process exits 1 when
any exhibit fails, so on today's main the suite is red by design: STATUS.md lists what is
expected to fail until each fix lands.

A run passes only when three witnesses agree (`lib/accounting.mjs`): Vitest exited 0,
the JSON report has passing tests for every test file of the exhibit, and the accounting
reporter saw no unhandled error and no lost file. An exhibit may add `check.mjs` (a check
of the run's output, such as the banner) or `runs` (several Vitest runs).

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

When a local copy is missing the exhibit is `N/A: requires-CI`, never skipped silently.

## Proving an exhibit is load-bearing

An exhibit that passes on a buggy build is useless. Each is proven one of four ways
(STATUS.md, Proof column):

- **fix proven**: fails on main with the bug's signature, passes on the build of its fix
  branch (`fixRef`);
- **guard proven**: a regression a fix PR introduced; passes on main, fails on that PR's
  build (`buggyRef`);
- **landed proven**: the fix is on main; fails on the build before it (`preFixRef`);
- **open**: no fix exists yet (or the PR does not fix this shape); fails on main, and its
  `control` (edits that remove the bug's precondition, such as `hotRuntime: false` for a
  hot leak) passes, showing the exhibit can pass.

To build a ref for the fix column: export it (`git archive <ref>`), `bun install
--frozen-lockfile`, `bun run build`, then `run.mjs --build <dir>/packages/vitest-native`.

## Classes

| Class | Where the bug lives |
|---|---|
| ownership | which module system (Node or Vite) evaluates a file; two copies of one module |
| env-contract | the environment a test file sees: globals, timers, error reporting, RNTL wiring |
| per-file-state | what survives from one test file to the next in a worker (the hot runtime) |
| presets | a mock of a library (preset, or a library's own Jest mock) diverging from the real one |
| transform/resolution | how a file is compiled or a request resolved (interop, extensions, pnpm paths) |
| harness | how a test must be written to hold across RNTL majors |
| config | how the plugin reads and writes Vitest's configuration |

## Not exhibited, and why

- **Report #3** (the V8 compile cache grows under hot, one entry per `?vnhot=N` stamp):
  DROPPED. It could not be made to fail on main `0f2400e`: two runs over the same files,
  and a run of two files followed by a run of four over the same installed ES module,
  both added 0 entries (495 -> 495). Either it changed since rc.4 or it needs the
  reporter's suite shape; a counter exhibit that passes on main would prove nothing.
- **Report #9** (snapshot key format differs from Jest's): documentation only; the
  behaviour is Vitest's, and #340 documents the coexistence recipe.
- **Report #12** (the automatic worker cap should scale with cores): a performance
  proposal measured only on bake-offs; the deterministic half (explicit counts are
  honoured) is `cfg-explicit-max-workers`.
- **Report #19** (the hot worker re-reads the filesystem per file): its deterministic
  form is the read counter in `pfs-hot-library-mock-cost`.
- **The `compare` command's review blockers (#352)** and the **verification-harness
  gate bugs** (check:size floors, unguarded cache keys): defects of unmerged tooling and
  of CI gates, not of the runtime; the harness audit's mutation scripts cover the gates.
