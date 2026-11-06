/**
 * `hangTimeout` (src/hang-watch.mjs): the watch fails a run whose tests stop making
 * progress and names what was running; it is quiet between watch-mode runs, under a
 * debugger, and when turned off. The real hung run is in hang-timeout.e2e.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HANG_TIMEOUT, HangWatch, debugging, hangTimeoutFor } from "../src/hang-watch.mjs";
import { validateOptions } from "../src/validate.js";

const file = (id: string) => ({ moduleId: id });
const test = (id: string, name: string) => ({ module: file(id), fullName: name });

afterEach(() => vi.useRealTimers());

function watch(timeoutMs = 1000) {
  vi.useFakeTimers();
  const exit = vi.fn();
  const write = vi.fn();
  return { w: new HangWatch({ timeoutMs, exit, write }), exit, write };
}

describe("HangWatch", () => {
  it("fails the run after the limit with no progress, naming the file and test", () => {
    const { w, exit, write } = watch();
    w.onTestRunStart();
    w.onTestModuleStart(file("/app/a.test.tsx"));
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

  it("restarts the limit on every test and file", () => {
    const { w, exit } = watch();
    w.onTestRunStart();
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(900);
      w.onTestModuleStart(file(`/app/${i}.test.ts`));
      w.onTestModuleEnd(file(`/app/${i}.test.ts`));
    }
    expect(exit).not.toHaveBeenCalled();
  });

  it("is quiet between runs (watch mode waiting for a change)", () => {
    const { w, exit } = watch();
    w.onTestRunStart();
    w.onTestRunEnd();
    vi.advanceTimersByTime(60_000);
    // Events outside a run do not arm it either.
    w.onTestModuleEnd(file("/app/late.test.ts"));
    vi.advanceTimersByTime(60_000);
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("hangTimeoutFor", () => {
  it("defaults to 60 s, or twice the longest test or hook timeout", () => {
    expect(hangTimeoutFor(undefined)).toBe(DEFAULT_HANG_TIMEOUT);
    expect(DEFAULT_HANG_TIMEOUT).toBe(60_000);
    expect(hangTimeoutFor(undefined, { testTimeout: 120_000, hookTimeout: 10_000 })).toBe(240_000);
  });

  it("uses a set value as given, and false turns it off", () => {
    expect(hangTimeoutFor(5000, { testTimeout: 120_000 })).toBe(5000);
    expect(hangTimeoutFor(false)).toBeNull();
  });
});

describe("debugging", () => {
  it("is on with Vitest's inspect options, an --inspect flag or an attached inspector", () => {
    expect(debugging({ inspect: true }, [])).toBe(true);
    expect(debugging({ inspectBrk: "9229" }, [])).toBe(true);
    expect(debugging({}, ["--inspect=0.0.0.0:9229"])).toBe(true);
    expect(debugging({}, ["--inspect-brk"])).toBe(true);
    expect(debugging({}, [], "ws://127.0.0.1:9229/x")).toBe(true);
    expect(debugging({}, ["--max-old-space-size=4096"])).toBe(false);
  });
});

describe("the hangTimeout option", () => {
  it("accepts a positive number or false, and nothing else", () => {
    expect(() => validateOptions({ hangTimeout: 30_000 })).not.toThrow();
    expect(() => validateOptions({ hangTimeout: false })).not.toThrow();
    for (const bad of [0, -1, Number.POSITIVE_INFINITY, "60s", true]) {
      expect(() => validateOptions({ hangTimeout: bad } as never)).toThrow(/hangTimeout/);
    }
  });
});
