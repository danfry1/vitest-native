/**
 * Worklets' own mock, the worklets preset's module under the native engine, sets
 * `requestAnimationFrame` as it loads. It is built as each file is set up (setup.mjs),
 * as a Jest suite installs it in its setup, so a test that installs fake timers before
 * anything imports worklets keeps a faked requestAnimationFrame and cancelAnimationFrame
 * that agree. Built inside the test instead, it replaced the faked requestAnimationFrame
 * with its setTimeout one, and cancelling that frame threw (expo-router's testing
 * library installs fake timers in renderRouter, before its store requests a frame).
 */
import { expect, it, vi } from "vitest";

it("keeps requestAnimationFrame and cancelAnimationFrame faked together", async () => {
  vi.useFakeTimers();
  try {
    await import("react-native-worklets");
    let ran = false;
    const id = requestAnimationFrame(() => {
      ran = true;
    });
    expect(() => cancelAnimationFrame(id)).not.toThrow();
    vi.runAllTimers();
    expect(ran).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
