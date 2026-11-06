/**
 * The hang guard's reporter (scripts/ci/hang-reporter.mjs) and progress log
 * (scripts/ci/deadline.mjs), without running Vitest: events in, verdicts out. The
 * end-to-end cases, a real hung run, are in ci-hang-guard.e2e.test.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import HangReporter from "../scripts/ci/hang-reporter.mjs";
// @ts-expect-error — runtime .mjs, no types
import { describeRunning, runningFromLog } from "../scripts/ci/deadline.mjs";

const file = (id: string) => ({ moduleId: id });
const test = (id: string, name: string) => ({ module: file(id), fullName: name });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("hang reporter", () => {
  const setup = (log?: string) => {
    vi.useFakeTimers();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exit = vi.fn();
    const reporter = new HangReporter({ idleMs: 1000, exit, log });
    reporter.onInit();
    return { reporter, exit };
  };

  it("fails after the idle limit with no progress, naming the file and test", () => {
    const { reporter, exit } = setup();
    reporter.onTestModuleStart(file("/p/a.test.ts"));
    reporter.onTestCaseReady(test("/p/a.test.ts", "suite > spins"));
    vi.advanceTimersByTime(999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(reporter.report()).toContain('Running: /p/a.test.ts (test "suite > spins")');
  });

  it("restarts the limit on every event", () => {
    const { reporter, exit } = setup();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(900);
      reporter.onTestModuleStart(file(`/p/${i}.test.ts`));
      reporter.onTestModuleEnd(file(`/p/${i}.test.ts`));
    }
    expect(exit).not.toHaveBeenCalled();
  });

  it("says when no file was running (setup or collection)", () => {
    const { reporter, exit } = setup();
    vi.advanceTimersByTime(1000);
    expect(exit).toHaveBeenCalledWith(1);
    expect(reporter.report().join("\n")).toMatch(/No test file was running/);
  });

  it("does not fire after the run ends", () => {
    const { reporter, exit } = setup();
    reporter.onTestModuleStart(file("/p/a.test.ts"));
    reporter.onTestModuleEnd(file("/p/a.test.ts"));
    reporter.onTestRunEnd();
    vi.advanceTimersByTime(10_000);
    expect(exit).not.toHaveBeenCalled();
  });

  it("writes the events a deadline reads back", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-hang-log-"));
    const log = path.join(dir, "progress.jsonl");
    const { reporter } = setup(log);
    reporter.onTestModuleStart(file("/p/a.test.ts"));
    reporter.onTestModuleStart(file("/p/b.test.ts"));
    reporter.onTestCaseReady(test("/p/b.test.ts", "loops"));
    reporter.onTestModuleEnd(file("/p/a.test.ts"));
    expect([...runningFromLog(log)]).toEqual([["/p/b.test.ts", "loops"]]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("progress log", () => {
  const write = (lines: string[]) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-hang-log-"));
    const log = path.join(dir, "progress.jsonl");
    fs.writeFileSync(log, lines.join("\n"));
    return log;
  };
  const e = (o: object) => JSON.stringify(o);

  it("clears a finished test and file, and starts over with each Vitest run", () => {
    const log = write([
      e({ event: "init" }),
      e({ event: "file-start", file: "a" }),
      e({ event: "test-start", file: "a", test: "t1" }),
      e({ event: "test-end", file: "a", test: "t1" }),
      e({ event: "run-end" }),
      e({ event: "init" }),
      e({ event: "file-start", file: "b" }),
      e({ event: "test-start", file: "b", test: "t2" }),
      e({ event: "test-end", file: "b", test: "t2" }),
      '{"event":"file-st', // cut short by the kill
    ]);
    expect([...runningFromLog(log)]).toEqual([["b", null]]);
    expect(describeRunning(runningFromLog(log))).toEqual(["Running: b (between tests)"]);
  });

  it("reads a missing log as nothing running", () => {
    expect(runningFromLog("/nonexistent/progress.jsonl").size).toBe(0);
    expect(describeRunning(new Map())[0]).toMatch(/No test file was running/);
  });
});
