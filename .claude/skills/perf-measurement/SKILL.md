---
name: perf-measurement
description: Measure vitest-native's speed or resource use so the result can be trusted and repeated. Use before stating any timing, comparing builds, or recording a performance change.
---

# Measure performance

1. **Write an evidence log, not an announcement.** Record the raw output of every run, the
   exact versions (vitest-native commit, Node, Vitest, React Native, OS, CPU) and the
   command. `packages/vitest-native/docs/metro-profile-investigation.md` is the model.
2. **Never act on one timing sample.** Run each side at least three times, alternate them,
   and report medians with the spread.
3. **Keep the unflattering results.** A slower case, a run that crashed, a suite where the
   change did nothing: they go in the log with the rest.
4. **Check a new measuring tool against a known value first.** A sampler that misses a
   renamed process, or a recorder that saves an all-failed run as a baseline, produces
   numbers that look plausible. Make recorders refuse impossible results (zero tests passed,
   no samples).
5. **Measure on a throwaway copy, readers before writers.** Running Vitest rewrites a Jest
   `.snap` file's header, which changes the next Jest run on the same copy. To undo a step,
   discard the copy and start again from source; `git checkout` can drop dependencies setup
   added. Diff `package.json` and the lockfile around every install.
6. **Prefer counts to clocks for tests.** A performance regression test counts the work
   (builds per worker, resolutions per lookup), not wall-clock time.
7. **Compute what is fixed for a run once.** A cache created inside a function that runs
   per test file is rebuilt per file; state that does not change during a run is computed
   in the plugin and passed to workers.
8. **One heavy run at a time.** Check first, matching the process rather than text, since
   your own shell's command line contains the pattern:
   ```bash
   pgrep -fl 'node .*vitest(\.mjs)? run'
   ```
   To queue behind a run, wait on its PID.
9. **Keep the machine awake** for long runs (`caffeinate -i` on macOS). A sleeping laptop
   stalls a run and looks like a hang or a regression.
10. **A real app's numbers are observations, not capability.** Audit the app's Jest setup
   (mocks, mappers, shims) before comparing. Speed claims in docs need this log, linked.
