// Time a process spends suspended (the machine asleep) must not count toward a deadline.
//
// Node's clocks disagree on it: on macOS, performance.now(), process.hrtime() and the
// timers count time asleep; on Linux they do not. So a deadline measures it instead. A
// periodic tick that arrives far later than its interval means the process did not run
// for that gap. Either the machine was asleep, or this process was starved or busy. CPU
// time tells the two apart: a busy or starved process still used CPU across the gap, a
// suspended one used almost none.
//
// A machine that idle-slept mid-run made the registry compiler kill itself on wake, as if
// it had run past its deadline, and the run fell back to per-file loading for nothing
// (#689). The run's wall-clock duration then included the sleep, which read as a 13-minute
// stall.

/** A tick at least this much later than its interval may be a suspension. */
export const SUSPENDED_GAP_MS = 10_000;

/** Below this share of the gap in CPU time, the process was suspended, not busy. */
const SUSPENDED_CPU_SHARE = 0.1;

/**
 * Track suspensions from periodic ticks. Call `tick()` on an interval of `intervalMs`;
 * `suspendedMs` is the total time suspended so far, `busiestMs` the longest a tick was
 * late without being a suspension (the process's own thread was busy or starved).
 */
export function suspensionTracker({
  intervalMs,
  gapMs = SUSPENDED_GAP_MS,
  now = () => performance.now(),
  cpuMs = () => {
    const { user, system } = process.cpuUsage();
    return (user + system) / 1000;
  },
}) {
  let last = now();
  let lastCpu = cpuMs();
  const state = {
    suspendedMs: 0,
    busiestMs: 0,
    tick() {
      const at = now();
      const cpu = cpuMs();
      const late = at - last - intervalMs;
      if (late >= gapMs && cpu - lastCpu < late * SUSPENDED_CPU_SHARE) state.suspendedMs += late;
      else if (late > 0) state.busiestMs = Math.max(state.busiestMs, late);
      last = at;
      lastCpu = cpu;
    },
  };
  return state;
}

/** " (the machine was asleep for N s of it, which is not counted)", or "" for none. */
export function suspendedNote(suspendedMs) {
  if (suspendedMs < 1000) return "";
  return `; the machine was asleep for ${Math.round(suspendedMs / 1000)} s of that, which is not counted`;
}
