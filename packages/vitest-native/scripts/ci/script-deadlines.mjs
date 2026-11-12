// Per-script deadlines for scripts/run-scripts.mjs on CI.
//
// The deadline is a backstop for a hang the idle guard cannot see (a worker stuck
// between progress events): it has to sit well above a healthy run, or it fails a run
// that is only slow. One 600 s deadline for every script did that. On Windows,
// test:native:ownership took 386-558 s on green main runs (2026-11-07) and went past
// 600 s while still passing tests, so main went red with nothing hung.
//
// Each deadline is about 2x the slowest green run seen for that script on that OS,
// rounded up to a minute. Measured from the Full gate's `native` legs of 7 main runs,
// 63a20219 to 1cb74f09 (perf-evidence/runs/20261107-pK-native-script-durations). A
// script not listed keeps VN_SCRIPT_DEADLINE_MS (600 s): every other script's slowest
// run was under 300 s. When a listed script's runs grow toward its deadline, measure
// again and update the row; do not raise it blind. A script that outgrows any sensible
// deadline is split instead: test:native:ownership was eight Vitest runs in one script
// (467-914 s on Windows) and is now four parts that run in parallel, each under 300 s.
const MINUTE = 60_000;

/** Script → { platform: deadline in ms }. Slowest green run in each comment. */
export const SCRIPT_DEADLINES = {
  // win 303.1 s, mac 153.5 s, linux 191.7 s.
  "test:native:project-babel": { win32: 11 * MINUTE, darwin: 6 * MINUTE, linux: 7 * MINUTE },
};

/** The deadline for `script` on `platform`, else the run's default. */
export function deadlineFor(script, defaultMs, platform = process.platform) {
  return SCRIPT_DEADLINES[script]?.[platform] ?? defaultMs;
}
