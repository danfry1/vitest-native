/**
 * Deadlines that do not count time the machine spends asleep (src/native/suspension.mjs).
 * On macOS, Node's clocks and timers count sleep, so a machine that idle-slept mid-run made
 * the registry compiler kill itself on wake as if it had overrun (#689). A tick far later
 * than its interval, with almost no CPU used across the gap, is a suspension; with CPU
 * used, the process was busy or starved, and that time still counts.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { suspendedNote, suspensionTracker } from "../src/native/suspension.mjs";

function clock() {
  const state = { now: 0, cpu: 0 };
  const tracker = suspensionTracker({
    intervalMs: 1000,
    now: () => state.now,
    cpuMs: () => state.cpu,
  });
  return { state, tracker };
}

describe("suspensionTracker", () => {
  it("counts a long gap with no CPU used as a suspension", () => {
    const { state, tracker } = clock();
    state.now += 1000;
    tracker.tick();
    state.now += 1000 + 600_000; // ten minutes asleep
    state.cpu += 5;
    tracker.tick();
    expect(tracker.suspendedMs).toBe(600_000);
  });

  it("counts a long gap with the CPU busy as work, not a suspension", () => {
    const { state, tracker } = clock();
    state.now += 1000 + 30_000;
    state.cpu += 25_000; // the process was running the whole time
    tracker.tick();
    expect(tracker.suspendedMs).toBe(0);
    expect(tracker.busiestMs).toBe(30_000);
  });

  it("ignores ordinary lateness below the gap", () => {
    const { state, tracker } = clock();
    state.now += 1000 + 2000;
    tracker.tick();
    expect(tracker.suspendedMs).toBe(0);
    expect(tracker.busiestMs).toBe(2000);
  });

  it("adds up several suspensions", () => {
    const { state, tracker } = clock();
    for (const asleep of [20_000, 45_000]) {
      state.now += 1000 + asleep;
      tracker.tick();
      state.now += 1000;
      tracker.tick();
    }
    expect(tracker.suspendedMs).toBe(65_000);
  });
});

describe("suspendedNote", () => {
  it("names a sleep in a failure message, and nothing for none", () => {
    expect(suspendedNote(0)).toBe("");
    expect(suspendedNote(612_400)).toBe(
      "; the machine was asleep for 612 s of that, which is not counted",
    );
  });
});
