import childProcess from "node:child_process";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHotMemoryPlan,
  effectiveMemoryLimit,
  formatHotMemoryPlan,
  formatHotWorkerDecision,
  hostAutoWorkers,
  hostPerformanceCores,
  resolveRequestedWorkers,
  type HotMemoryPlan,
} from "../src/native/memory.mjs";
import { nativePool } from "../src/native/pool.js";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

// The host the plans below read when they are not handed an automatic count: sysctl
// answers as `answer` says (null: it fails, as on an Intel Mac).
function sysctlAnswers(answer: string | null) {
  return vi.spyOn(childProcess, "spawnSync").mockReturnValue({
    status: answer === null ? 1 : 0,
    stdout: answer ?? "",
  } as never);
}
function onPlatform(platform: string) {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { ...original, value: platform });
  return () => Object.defineProperty(process, "platform", original);
}

describe("the automatic worker count (#906)", () => {
  afterEach(() => vi.restoreAllMocks());
  const reader = (values: string[] | null) => vi.fn(() => values);

  it("reads the performance cores from macOS's core classes", () => {
    const sysctl = reader(["2", "6"]);
    expect(hostPerformanceCores({ platform: "darwin", sysctl })).toBe(6);
    expect(sysctl).toHaveBeenCalledWith(["hw.nperflevels", "hw.perflevel0.physicalcpu"]);
    expect(hostAutoWorkers({ platform: "darwin", sysctl })).toEqual({
      count: 6,
      source: "performance-cores",
    });
  });

  it("falls back to four where the OS reports no core classes", () => {
    const fallback = { count: 4, source: "default" };
    // A Linux container: core classes are not read at all.
    const linux = reader(["2", "6"]);
    expect(hostAutoWorkers({ platform: "linux", sysctl: linux })).toEqual(fallback);
    expect(linux).not.toHaveBeenCalled();
    // An Intel Mac has no hw.perflevel*, and a single level is no split.
    expect(hostAutoWorkers({ platform: "darwin", sysctl: reader(null) })).toEqual(fallback);
    expect(hostAutoWorkers({ platform: "darwin", sysctl: reader(["1", "8"]) })).toEqual(fallback);
    expect(hostAutoWorkers({ platform: "darwin", sysctl: reader(["2", "x"]) })).toEqual(fallback);
  });

  it("never chooses fewer than the two workers recycling needs", () => {
    expect(hostAutoWorkers({ platform: "darwin", sysctl: reader(["2", "1"]) })).toEqual({
      count: 2,
      source: "performance-cores",
    });
  });

  it("asks sysctl itself, and falls back when it fails", () => {
    const restore = onPlatform("darwin");
    try {
      const spawn = sysctlAnswers("2\n6\n");
      expect(hostAutoWorkers()).toEqual({ count: 6, source: "performance-cores" });
      expect(spawn).toHaveBeenCalledWith(
        "/usr/sbin/sysctl",
        ["-n", "hw.nperflevels", "hw.perflevel0.physicalcpu"],
        expect.objectContaining({ encoding: "utf8" }),
      );
      sysctlAnswers(null);
      expect(hostAutoWorkers()).toEqual({ count: 4, source: "default" });
      // One answer for two names is not a reading.
      sysctlAnswers("6\n");
      expect(hostAutoWorkers()).toEqual({ count: 4, source: "default" });
    } finally {
      restore();
    }
  });

  it("plans the automatic count from the host, bounded by memory", () => {
    const sixP = { count: 6, source: "performance-cores" } as const;
    const plan = (totalMemory: number, autoWorkers = sixP as never) =>
      createHotMemoryPlan({ totalMemory, constrainedMemory: 0, requestedWorkers: 11, autoWorkers });
    expect(plan(64 * GIB)).toMatchObject({ maxWorkers: 6, autoWorkers: 6 });
    // 2 GiB admits four 256 MiB envelopes: memory still decides below the cores.
    expect(plan(2 * GIB)).toMatchObject({ maxWorkers: 4, admittedWorkers: 4 });
    // No known memory limit: the automatic count is the bound.
    expect(plan(0)).toMatchObject({ source: "unknown", maxWorkers: 6 });
    // Fewer CPUs to spare than performance cores: the request bounds it.
    expect(
      createHotMemoryPlan({
        totalMemory: 64 * GIB,
        constrainedMemory: 0,
        requestedWorkers: 3,
        autoWorkers: sixP,
      }),
    ).toMatchObject({ maxWorkers: 3 });
  });

  it("reads the host when no automatic count is handed in", () => {
    const restore = onPlatform("darwin");
    try {
      sysctlAnswers("2\n6\n");
      const host = { totalMemory: 64 * GIB, constrainedMemory: 0, requestedWorkers: 11 };
      expect(createHotMemoryPlan(host)).toMatchObject({
        maxWorkers: 6,
        autoWorkersSource: "performance-cores",
      });
      // A count the user set with a known memory limit leaves the host unread.
      const spawn = sysctlAnswers("2\n6\n");
      spawn.mockClear();
      expect(createHotMemoryPlan({ ...host, explicitWorkers: true })).toMatchObject({
        maxWorkers: 11,
        autoWorkersSource: "not-used",
      });
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("names how the count was chosen on the workers line", () => {
    const line = (autoWorkers: { count: number; source: "performance-cores" | "default" }) =>
      formatHotWorkerDecision(
        createHotMemoryPlan({
          totalMemory: 64 * GIB,
          constrainedMemory: 0,
          requestedWorkers: 11,
          autoWorkers,
        }),
      );
    expect(line({ count: 6, source: "performance-cores" })).toBe(
      "workers: 6 (automatic: 6, the host's performance cores; 11 available, set maxWorkers to run more; 65536 MiB host memory)",
    );
    expect(line({ count: 4, source: "default" })).toBe(
      "workers: 4 (automatic: 4, the default where the OS reports no performance cores; 11 available, set maxWorkers to run more; 65536 MiB host memory)",
    );
  });
});

describe("hot memory planning", () => {
  // Off a Mac with core classes: these plans take the fallback of four.
  beforeEach(() => {
    sysctlAnswers(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("prefers the cgroup ceiling over host total memory", () => {
    expect(effectiveMemoryLimit({ totalMemory: 16 * GIB, constrainedMemory: 512 * MIB })).toEqual({
      bytes: 512 * MIB,
      source: "constrained",
    });
    expect(effectiveMemoryLimit({ totalMemory: 8 * GIB, constrainedMemory: 0 })).toEqual({
      bytes: 8 * GIB,
      source: "host",
    });
  });

  it("reproduces the measured 512MiB/1GiB/2GiB container plans", () => {
    const plan = (limit: number) =>
      createHotMemoryPlan({
        totalMemory: 16 * GIB,
        constrainedMemory: limit,
        requestedWorkers: 16,
      });

    expect(plan(512 * MIB)).toMatchObject({
      source: "constrained",
      maxWorkers: 1,
      workerHeapLimit: 96 * MIB,
    });
    expect(plan(1 * GIB)).toMatchObject({ maxWorkers: 1 });
    expect(plan(2 * GIB)).toMatchObject({ maxWorkers: 4 });
    expect(plan(2 * GIB).workerHeapLimit).toBeGreaterThan(190 * MIB);
    expect(plan(2 * GIB).workerHeapLimit).toBeLessThan(195 * MIB);
    expect(plan(2 * GIB).hardRssLimit).toBeLessThan(2 * GIB);
  });

  it("caps only the automatic worker count (four, with no core classes); memory bounds an explicit one", () => {
    const host = (requestedWorkers: number, explicitWorkers?: boolean) =>
      createHotMemoryPlan({
        totalMemory: 4 * GIB,
        constrainedMemory: 0,
        requestedWorkers,
        explicitWorkers,
      });
    expect(host(10)).toMatchObject({ admittedWorkers: 4, maxWorkers: 4 });
    // 4 GiB leaves an envelope of eleven 256 MiB workers.
    expect(host(10, true)).toMatchObject({ requestedWorkers: 10, maxWorkers: 10 });
    expect(host(16, true)).toMatchObject({ admittedWorkers: 11, maxWorkers: 11 });
    // More workers share the same envelope, so each recycles at a lower heap.
    expect(host(10, true).workerHeapLimit).toBeLessThan(host(10).workerHeapLimit);
    expect(host(3, true)).toMatchObject({ maxWorkers: 3 });

    // Memory still caps an explicit request: 2 GiB admits four 256 MiB envelopes.
    expect(
      createHotMemoryPlan({
        totalMemory: 16 * GIB,
        constrainedMemory: 2 * GIB,
        requestedWorkers: 8,
        explicitWorkers: true,
      }),
    ).toMatchObject({ requestedWorkers: 8, admittedWorkers: 4, maxWorkers: 4 });
    // With no known limit nothing admits more than the measured default.
    expect(
      createHotMemoryPlan({
        totalMemory: 0,
        constrainedMemory: 0,
        requestedWorkers: 8,
        explicitWorkers: true,
      }),
    ).toMatchObject({ source: "unknown", maxWorkers: 4 });
  });

  it("resolves Vitest worker counts and percentage syntax", () => {
    expect(resolveRequestedWorkers(undefined, { parallelism: 10 })).toBe(9);
    expect(resolveRequestedWorkers("50%", { parallelism: 10 })).toBe(5);
    expect(resolveRequestedWorkers("3", { parallelism: 10 })).toBe(3);
    expect(resolveRequestedWorkers(8, { parallelism: 10, fileParallelism: false })).toBe(1);
  });

  it("states the worker decision in one line", () => {
    // 2 GiB admits one worker: fewer than the eight requested.
    const capped = createHotMemoryPlan({
      totalMemory: 2 * GIB,
      constrainedMemory: 0,
      requestedWorkers: 8,
    });
    expect(formatHotWorkerDecision(capped)).toBe(
      `workers: ${capped.maxWorkers} (memory plan admitted ${capped.admittedWorkers} of 8 requested, 2048 MiB host memory)`,
    );
    expect(capped.maxWorkers).toBeLessThan(8);
    // Plenty of memory, no count set: the automatic cap chose, not memory.
    const auto = createHotMemoryPlan({
      totalMemory: 64 * GIB,
      constrainedMemory: 0,
      requestedWorkers: 9,
    });
    expect(auto.maxWorkers).toBe(4);
    expect(formatHotWorkerDecision(auto)).toBe(
      "workers: 4 (automatic: 4, the default where the OS reports no performance cores; 9 available, set maxWorkers to run more; 65536 MiB host memory)",
    );
    // The same machine with the count set: memory alone bounds it.
    const set = createHotMemoryPlan({
      totalMemory: 64 * GIB,
      constrainedMemory: 0,
      requestedWorkers: 9,
      explicitWorkers: true,
    });
    expect(formatHotWorkerDecision(set)).toMatch(
      /^workers: 9 \(as requested; memory plan admits up to \d+, 65536 MiB host memory\)$/,
    );
    // A container's limit below the host's is named as the limit.
    const roomy = createHotMemoryPlan({
      totalMemory: 64 * GIB,
      constrainedMemory: 32 * GIB,
      requestedWorkers: 2,
    });
    expect(formatHotWorkerDecision(roomy)).toBe(
      `workers: 2 (as requested; memory plan admits up to ${roomy.admittedWorkers}, 32768 MiB memory limit)`,
    );
    const unknown = createHotMemoryPlan({
      totalMemory: 0,
      constrainedMemory: 0,
      requestedWorkers: 3,
    });
    expect(formatHotWorkerDecision(unknown)).toMatch(
      /^workers: 3 \(as requested; .*, memory unknown\)$/,
    );
  });

  it("formats every decision needed for diagnostics", () => {
    const lines = formatHotMemoryPlan(
      createHotMemoryPlan({
        totalMemory: 2 * GIB,
        constrainedMemory: 0,
        requestedWorkers: 8,
      }),
    );
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("effective limit"),
        expect.stringContaining("requested/admitted/selected"),
        "automatic worker count: 4, the default where the OS reports no performance cores",
        expect.stringContaining("worker heap"),
        expect.stringContaining("reserves"),
      ]),
    );
  });
});

const projectRoot = path.resolve(import.meta.dirname, "..");
const workerEntry = path.resolve(projectRoot, "src/native/worker.mjs");
const poolOptions = {
  distPath: "/tmp/unused",
  project: {
    vitest: { logger: { outputStream: process.stdout, errorStream: process.stderr } },
  },
  method: "run" as const,
  environment: { name: "node", options: null },
  execArgv: [],
  env: {},
};
const task = { context: { environment: { name: "node", options: null } } };
const plan: HotMemoryPlan = {
  version: 1,
  source: "constrained",
  effectiveLimit: 200 * MIB,
  softRssLimit: 100 * MIB,
  hardRssLimit: 180 * MIB,
  requestedWorkers: 2,
  autoWorkers: 4,
  autoWorkersSource: "default",
  admittedWorkers: 2,
  maxWorkers: 2,
  workerHeapLimit: 96 * MIB,
  mainProcessReserve: 0,
  replacementOverlapReserve: 0,
};

describe("hot pool RSS enforcement", () => {
  it("fails before starting a task beyond the process hard limit", () => {
    const pool = nativePool({
      workerEntry,
      projectRoot,
      memoryLimit: plan.workerHeapLimit,
      memoryPlan: plan,
      sampleRss: () => 190 * MIB,
    });
    const worker = pool.createPoolWorker(poolOptions as never);
    expect(() => worker.send({ type: "run", context: { files: ["a.test.ts"] } } as never)).toThrow(
      /process RSS is 190 MiB.*180 MiB hard limit/s,
    );
  });

  it("serializes soft-RSS recycling so replacements do not fan out", async () => {
    const pool = nativePool({
      workerEntry,
      projectRoot,
      memoryLimit: plan.workerHeapLimit,
      memoryPlan: plan,
      sampleRss: () => 120 * MIB,
    });
    const first = pool.createPoolWorker(poolOptions as never);
    const second = pool.createPoolWorker(poolOptions as never);

    expect(first.canReuse?.(task as never)).toBe(false);
    expect(second.canReuse?.(task as never)).toBe(true);
    await expect(first.stop()).rejects.toThrow(/torn down or never initialized/);
    expect(second.canReuse?.(task as never)).toBe(false);
  });

  it("rejects unrecyclable batches unless the risk was explicit", () => {
    const bounded = nativePool({
      workerEntry,
      projectRoot,
      memoryLimit: 1,
      memoryPlan: plan,
      sampleRss: () => 50 * MIB,
    }).createPoolWorker(poolOptions as never);
    expect(() =>
      bounded.send({ type: "run", context: { files: ["a.test.ts", "b.test.ts"] } } as never),
    ).toThrow(/cannot recycle at file boundaries.*allowUnboundedMemory:true/s);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unbounded = nativePool({
      workerEntry,
      projectRoot,
      memoryLimit: 1,
      memoryPlan: plan,
      allowUnboundedMemory: true,
      sampleRss: () => 999 * MIB,
    }).createPoolWorker(poolOptions as never);
    expect(() =>
      unbounded.send({
        type: "run",
        context: { files: ["a.test.ts", "b.test.ts"] },
      } as never),
    ).toThrow(/torn down or never initialized/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("allowUnboundedMemory:true"));
    warn.mockRestore();
  });
});
