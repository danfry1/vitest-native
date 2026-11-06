/**
 * `hangTimeout` (src/hang-watch.mjs): the watch fails a run whose tests stop making
 * progress, once the running tests are also past their own budgets, and names them from
 * the workers' records (src/hang-watch-setup.mjs). Quiet between runs, outside the
 * file-running window, under a debugger, and when off. Real runs: hang-timeout.e2e.test.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HANG_TIMEOUT,
  HangWatch,
  MAX_HANG_TIMEOUT,
  debugging,
  hangTimeoutFor,
  readTestRecords,
  runByCli,
  testBudget,
} from "../src/hang-watch.mjs";
import { validateOptions } from "../src/validate.js";

const file = (id: string) => ({ moduleId: id });
const test = (id: string, name: string) => ({ module: file(id), fullName: name });

afterEach(() => vi.useRealTimers());

function watch(timeoutMs = 1000, dir?: string) {
  vi.useFakeTimers();
  const exit = vi.fn();
  const write = vi.fn();
  const w = new HangWatch({
    timeoutMs,
    recordsDir: dir,
    exit,
    write,
    cli: true,
    graceMs: 0,
    now: () => Date.now(),
  });
  return { w, exit, write };
}

function recordsDir(records: object[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-hang-records-"));
  records.forEach((r, i) => fs.writeFileSync(path.join(dir, `${i}.json`), JSON.stringify(r)));
  return dir;
}

describe("HangWatch", () => {
  it("fails the run after the limit with no progress, naming the file and test", () => {
    const { w, exit, write } = watch();
    w.onTestRunStart();
    w.onTestModuleQueued(file("/app/a.test.tsx"));
    w.onTestCaseReady(test("/app/a.test.tsx", "Screen > renders"));
    vi.advanceTimersByTime(999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
    const text = write.mock.calls.join("");
    expect(text).toContain("No test made progress for 1 s (hangTimeout)");
    expect(text).toContain("Running: /app/a.test.tsx › Screen > renders");
    expect(text).toContain("testTimeout cannot interrupt");
  });

  it("waits for a running test inside its own budget, then names it from the worker's record", () => {
    vi.useFakeTimers();
    const record = {
      file: "/app/slow.test.ts",
      test: "imports > a large graph",
      at: Date.now(),
      timeout: 5000,
      hookTimeout: 1000,
    };
    const dir = recordsDir([record]);
    const { w, exit, write } = watch(1000, dir);
    w.onTestRunStart();
    w.onTestModuleQueued(file("/app/slow.test.ts"));
    // Past the no-progress limit, but not past the test's own 5 s + hooks + slack (8 s).
    vi.advanceTimersByTime(4000);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(testBudget(record));
    expect(exit).toHaveBeenCalledWith(1);
    expect(write.mock.calls.join("")).toContain(
      "Running: /app/slow.test.ts › imports > a large graph",
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not fail a test paused in a debugger", () => {
    vi.useFakeTimers();
    const dir = recordsDir([
      { file: "/app/a.test.ts", test: "t", at: 0, timeout: 1, debugger: true },
    ]);
    const { w, exit } = watch(1000, dir);
    w.onTestRunStart();
    w.onTestModuleQueued(file("/app/a.test.ts"));
    vi.advanceTimersByTime(60_000);
    expect(exit).not.toHaveBeenCalled();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("restarts the limit on every test and file", () => {
    const { w, exit } = watch();
    w.onTestRunStart();
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(900);
      w.onTestModuleQueued(file(`/app/${i}.test.ts`));
      w.onTestModuleEnd(file(`/app/${i}.test.ts`));
      w.onTestModuleQueued(file(`/app/${i}b.test.ts`));
    }
    expect(exit).not.toHaveBeenCalled();
  });

  it("does not watch while no file is in flight (global setup, coverage, typecheck)", () => {
    const { w, exit } = watch();
    w.onTestRunStart();
    vi.advanceTimersByTime(10_000);
    w.onTestModuleQueued(file("/app/a.test.ts"));
    w.onTestModuleEnd(file("/app/a.test.ts"));
    vi.advanceTimersByTime(10_000);
    expect(exit).not.toHaveBeenCalled();
  });

  it("names a file stuck before any test started", () => {
    const { w, exit, write } = watch();
    w.onTestRunStart();
    w.onTestModuleQueued(file("/app/stuck-import.test.ts"));
    vi.advanceTimersByTime(1000);
    expect(exit).toHaveBeenCalledWith(1);
    expect(write.mock.calls.join("")).toContain(
      "Running: /app/stuck-import.test.ts (no test had started",
    );
  });

  it("is quiet between runs (watch mode waiting for a change)", () => {
    const { w, exit } = watch();
    w.onTestRunStart();
    w.onTestRunEnd();
    vi.advanceTimersByTime(60_000);
    w.onTestModuleEnd(file("/app/late.test.ts"));
    vi.advanceTimersByTime(60_000);
    expect(exit).not.toHaveBeenCalled();
  });

  it("asks Vitest to close, and ends only Vitest's own CLI process", async () => {
    const close = vi.fn(() => Promise.resolve());
    for (const cli of [true, false]) {
      const exit = vi.fn();
      const w = new HangWatch({ timeoutMs: 10, exit, write: vi.fn(), cli, graceMs: 50 });
      w.onInit({ close });
      await w.trip();
      expect(exit).toHaveBeenCalledTimes(cli ? 1 : 0);
    }
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe("contribute (one say per project)", () => {
  it("is on if any project turns it on, off if any sets false, with the longest limit", () => {
    const w = new HangWatch({ timeoutMs: null });
    expect(w.watching()).toBe(false);
    w.contribute({ active: false, limit: 300_000 }); // a non-hot project with long tests
    w.contribute({ active: true, limit: 60_000 }); // the hot one
    expect(w.watching()).toBe(true);
    expect(w.timeoutMs).toBe(300_000);
    w.contribute({ off: true });
    expect(w.watching()).toBe(false);
  });
});

describe("hangTimeoutFor and budgets", () => {
  it("defaults to 60 s, or twice the longest test or hook timeout", () => {
    expect(hangTimeoutFor(undefined)).toBe(DEFAULT_HANG_TIMEOUT);
    expect(DEFAULT_HANG_TIMEOUT).toBe(60_000);
    expect(hangTimeoutFor(undefined, { testTimeout: 120_000, hookTimeout: 10_000 })).toBe(240_000);
  });

  it("is off when the limit is not a finite timer delay (testTimeout: Infinity)", () => {
    expect(hangTimeoutFor(undefined, { testTimeout: Number.POSITIVE_INFINITY })).toBeNull();
    expect(hangTimeoutFor(undefined, { hookTimeout: MAX_HANG_TIMEOUT })).toBeNull();
    expect(hangTimeoutFor(MAX_HANG_TIMEOUT + 1)).toBeNull();
    expect(hangTimeoutFor(MAX_HANG_TIMEOUT)).toBe(MAX_HANG_TIMEOUT);
  });

  it("uses a set value as given, and false turns it off", () => {
    expect(hangTimeoutFor(5000, { testTimeout: 120_000 })).toBe(5000);
    expect(hangTimeoutFor(false)).toBeNull();
  });

  it("gives a test its timeout plus two hook timeouts and a second of slack", () => {
    expect(testBudget({ file: "f", test: "t", at: 0, timeout: 90_000, hookTimeout: 10_000 })).toBe(
      111_000,
    );
  });

  it("reads the latest record per file and skips a half-written one", () => {
    const dir = recordsDir([
      { file: "/a.test.ts", test: "old", at: 1 },
      { file: "/a.test.ts", test: "new", at: 2 },
      { file: "/b.test.ts", test: "b", at: 1 },
    ]);
    fs.writeFileSync(path.join(dir, "partial.json"), '{"file":"/c.te');
    const records = readTestRecords(dir);
    expect(records.get("/a.test.ts")?.test).toBe("new");
    expect(records.get("/b.test.ts")?.test).toBe("b");
    expect(records.has("/c.test.ts")).toBe(false);
    expect(readTestRecords("/nonexistent/dir").size).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("debugging and the CLI check", () => {
  it("is on with Vitest's inspect options, workers' or this process's --inspect, or an open inspector", () => {
    expect(debugging([{ inspect: true }], [])).toBe(true);
    expect(debugging([{}, { inspectBrk: "9229" }], [])).toBe(true);
    expect(debugging([{ execArgv: ["--inspect-brk=9230"] }], [])).toBe(true);
    expect(debugging([undefined, {}], ["--inspect=0.0.0.0:9229"])).toBe(true);
    expect(debugging([], [], "ws://127.0.0.1:9229/x")).toBe(true);
    expect(debugging([{ execArgv: ["--max-old-space-size=4096"] }], ["--enable-source-maps"])).toBe(
      false,
    );
  });

  it("knows Vitest's CLI from a host process", () => {
    expect(runByCli(["node", "/x/node_modules/vitest/vitest.mjs"])).toBe(true);
    expect(runByCli(["node", "/x/node_modules/.bin/vitest"])).toBe(true);
    expect(runByCli(["node", "/x/my-ide-host.js"])).toBe(false);
  });
});

describe("the hangTimeout option", () => {
  it("accepts a positive number or false, and nothing else", () => {
    expect(() => validateOptions({ hangTimeout: 30_000 })).not.toThrow();
    expect(() => validateOptions({ hangTimeout: false })).not.toThrow();
    for (const bad of [0, -1, Number.POSITIVE_INFINITY, MAX_HANG_TIMEOUT + 1, "60s", true]) {
      expect(() => validateOptions({ hangTimeout: bad } as never)).toThrow(/hangTimeout/);
    }
  });
});
