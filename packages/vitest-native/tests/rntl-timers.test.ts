// The `jest` RNTL's own files get under the native engine (src/native/rntl-hooks.mjs),
// against the installed RNTL's real fake-timer detection.
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRntlJest, needsRntlJest, withRntlJest } from "../src/native/rntl-hooks.mjs";

const require = createRequire(import.meta.url);
const rntlRoot = path.dirname(require.resolve("@testing-library/react-native/package.json"));
const rntlBuild = ["build", "dist"]
  .map((dir) => path.join(rntlRoot, dir))
  .find((dir) => fs.existsSync(path.join(dir, "helpers", "timers.js")))!;
const timersFile = path.join(rntlBuild, "helpers", "timers.js");
const KEY = "__vitest_native_rntl_jest";

/** RNTL's helpers/timers.js, compiled as the native engine compiles it. */
function loadRntlTimers(): { jestFakeTimersAreEnabled(): boolean } {
  const mod = new Module(timersFile);
  mod.filename = timersFile;
  (mod as unknown as { _compile(src: string, file: string): void })._compile(
    withRntlJest(fs.readFileSync(timersFile, "utf8")),
    timersFile,
  );
  return mod.exports;
}

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>)[KEY];
});

describe("RNTL's jest", () => {
  it("is given to every RNTL file that reads a free jest, and only those", () => {
    for (const file of ["helpers/timers.js", "wait-for.js", "user-event/setup/setup.js"]) {
      const full = path.join(rntlBuild, file);
      expect(needsRntlJest(full, fs.readFileSync(full, "utf8")), file).toBe(true);
    }
    const index = path.join(rntlBuild, "index.js");
    expect(needsRntlJest(index, fs.readFileSync(index, "utf8"))).toBe(false);
    // The same source outside RNTL's package is not RNTL's.
    const src = fs.readFileSync(timersFile, "utf8");
    expect(needsRntlJest("/app/node_modules/other/build/helpers/timers.js", src)).toBe(false);
    expect(needsRntlJest("/app/src/helpers/timers.js", src)).toBe(false);
  });

  it("does not match a jest reached through another object or inside a word", () => {
    const file = "/app/node_modules/@testing-library/react-native/build/x.js";
    expect(needsRntlJest(file, "const a = config.jest.fn; require('jest-matcher-utils');")).toBe(
      false,
    );
    expect(needsRntlJest(file, "if (typeof jest === 'undefined') {}")).toBe(true);
    expect(needsRntlJest(file, "  jest.advanceTimersByTime(1);")).toBe(true);
  });

  it("makes RNTL's detection see Vitest's fake timers, and only while they are on", () => {
    (globalThis as Record<string, unknown>)[KEY] = createRntlJest(vi);
    const timers = loadRntlTimers();
    expect(timers.jestFakeTimersAreEnabled()).toBe(false);
    vi.useFakeTimers();
    expect(timers.jestFakeTimersAreEnabled()).toBe(true);
    vi.useRealTimers();
    expect(timers.jestFakeTimersAreEnabled()).toBe(false);
    expect((globalThis as { jest?: unknown }).jest).toBeUndefined();
  });

  it("answers the five calls RNTL makes through vi", async () => {
    const jest = createRntlJest(vi);
    expect(Object.isFrozen(jest)).toBe(true);
    expect(Object.keys(jest).sort()).toEqual([
      "advanceTimersByTime",
      "advanceTimersByTimeAsync",
      "getRealSystemTime",
      "useFakeTimers",
      "useRealTimers",
    ]);
    jest.useFakeTimers();
    expect(vi.isFakeTimers()).toBe(true);
    const fired: number[] = [];
    setTimeout(() => fired.push(1), 50);
    jest.advanceTimersByTime(50);
    setTimeout(() => fired.push(2), 50);
    await jest.advanceTimersByTimeAsync(50);
    expect(fired).toEqual([1, 2]);
    vi.setSystemTime(0);
    expect(Date.now()).toBeLessThan(1000);
    // Real time, not the fake clock: RNTL calls it only to tell modern timers apart.
    expect(jest.getRealSystemTime()).toBeGreaterThan(1e12);
    jest.useRealTimers();
    expect(vi.isFakeTimers()).toBe(false);
  });
});
