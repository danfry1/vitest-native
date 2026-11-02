// The `jest` RNTL's own files get under the native engine (src/native/rntl-hooks.mjs),
// against the installed RNTL's real fake-timer detection.
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRntlJest,
  needsRntlJest,
  rntlSource,
  withRntlJest,
} from "../src/native/rntl-hooks.mjs";

const require = createRequire(import.meta.url);
const rntlRoot = path.dirname(require.resolve("@testing-library/react-native/package.json"));
const rntlBuild = ["build", "dist"]
  .map((dir) => path.join(rntlRoot, dir))
  .find((dir) => fs.existsSync(path.join(dir, "helpers", "timers.js")))!;
const timersFile = path.join(rntlBuild, "helpers", "timers.js");
const KEY = "__vitest_native_rntl_jest";
const RNTL_FILE = "/app/node_modules/@testing-library/react-native/build/x.js";

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
  it("is given to the RNTL files that read a free jest, and not to its entry or other packages", () => {
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
    expect(
      needsRntlJest(RNTL_FILE, "const a = config.jest.fn; require('jest-matcher-utils');"),
    ).toBe(false);
    // Either form alone selects a file.
    expect(needsRntlJest(RNTL_FILE, "if (typeof jest === 'undefined') {}")).toBe(true);
    expect(needsRntlJest(RNTL_FILE, "  jest.advanceTimersByTime(1);")).toBe(true);
  });

  it("leaves a file it cannot wrap, and a file Node compiles as an ES module, as it is", () => {
    const cjs = "if (typeof jest !== 'undefined') exports.a = 1;";
    expect(rntlSource(cjs, RNTL_FILE, undefined)).toBe(withRntlJest(cjs));
    expect(rntlSource(cjs, RNTL_FILE, null)).toBe(withRntlJest(cjs));
    expect(rntlSource(cjs, RNTL_FILE, "module")).toBe(cjs);
    // ES module syntax in a `.js` file whose format Node has not decided: Node detects it
    // when compiling as CommonJS fails, which a wrapped copy would turn into a SyntaxError.
    const esm = "import x from 'y';\nexport const a = typeof jest;";
    expect(rntlSource(esm, RNTL_FILE, null)).toBe(esm);
    expect(rntlSource(cjs, "/app/src/x.js", undefined)).toBe(cjs);
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

  it("advances asynchronously: a timer scheduled after a promise fires in the same advance", async () => {
    const jest = createRntlJest(vi);
    jest.useFakeTimers();
    const fired: string[] = [];
    setTimeout(async () => {
      fired.push("first");
      await Promise.resolve();
      setTimeout(() => fired.push("second"), 10);
    }, 10);
    // RNTL 14's waitFor uses this for modern timers; a synchronous advance would fire
    // only the first timer, as the second is scheduled after a microtask.
    await jest.advanceTimersByTimeAsync(50);
    expect(fired).toEqual(["first", "second"]);
  });

  it("does nothing when asked to advance with real timers, as Jest only warns", async () => {
    const jest = createRntlJest(vi);
    expect(vi.isFakeTimers()).toBe(false);
    expect(() => jest.advanceTimersByTime(50)).not.toThrow();
    await expect(jest.advanceTimersByTimeAsync(50)).resolves.toBeUndefined();
  });
});
