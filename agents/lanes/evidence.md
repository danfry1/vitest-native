# Lane: evidence

The proof apparatus: the bug museum, cross-check, consumer tests, the ecosystem probe, benchmarks and the example app. This lane decides what counts as proof.

**Where to look:** `validation/bug-museum/`, `validation/config-axes/`, `validation/vitest-semantics/`, `validation/ownership-cost/`, `crosscheck/`, `consumer-tests/`, `ecosystem-probe/`, `/bench/`, `/apps/example/`.

## Invariants
- **Deterministic counts are the hard gate; timings are only tripwires.** Budgets are cumulative against fixed anchors, never ratios per PR. (ADR 0002)
- **Every gate is shown to go red under its own mutation.** (ADR 0002)
- **Every bug-museum exhibit has an anchored signature,** and merged exhibits stay green. (ADR 0002)
- **The only acceptable explanation for a pass→fail is Jest's behaviour or a declared deviation.** (ADR 0002)

## Settled decisions
- **Run untrusted apps only in the hardened container.** If the release-age floor trips, stop. Never lower it.
- **Keep the raw output and SHAs of every performance run,** unflattering runs included, alongside the result. Bake-off numbers are tripwires only.

## Working rules
- **Every fix gets an exhibit** that fails as the bug on main, passes with the fix, and passes the control. For landed fixes, use `preFixRef = merge^`, and pin buggy SHAs rather than branches. Commit a refresh only if no proof gets worse.
- **Verify on a packed tarball,** byte-equal to `npm pack`, never on a workspace link. Cover stock and hot, cold and warm, and explain every stderr line.
- **Freeze the pass criteria before collecting data.** Use interleaved A/B runs with a plain-Vitest control, and size samples to the flake rate.
- **Measure on a throwaway copy,** never on the prepared environment itself.

## Traps
- **Read the museum verdict's `(build: <dir>, <sha>)` line before reporting it.**
- **Bound any test that spawns a runner** with a fail-fast filter (`--only no-such-exhibit`) and a timeout. `run.mjs --help` starts a full run.
- **Museum columns use each ref's own install.** The macOS temp cleaner corrupts the build cache in `os.tmpdir()`, so reinstall with `--force`.
- **The cross-check runs against `dist`.** Rebuild before every proof.
- **When two runners share a copy, run Jest before Vitest.** Vitest rewrites `.snap` headers.
- **`vitest run -u <path>` swallows the path filter.** That's a Vitest CLI issue, not ours.
- **A zero-load baseline is invalid.** Recorders must refuse it.
