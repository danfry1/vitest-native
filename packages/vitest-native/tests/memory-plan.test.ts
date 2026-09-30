import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createHotMemoryPlan,
  effectiveMemoryLimit,
  formatHotMemoryPlan,
  resolveRequestedWorkers,
  type HotMemoryPlan,
} from "../src/native/memory.mjs";
import { nativePool } from "../src/native/pool.js";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

describe("hot memory planning", () => {
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

  it("resolves Vitest worker counts and percentage syntax", () => {
    expect(resolveRequestedWorkers(undefined, { parallelism: 10 })).toBe(9);
    expect(resolveRequestedWorkers("50%", { parallelism: 10 })).toBe(5);
    expect(resolveRequestedWorkers("3", { parallelism: 10 })).toBe(3);
    expect(resolveRequestedWorkers(8, { parallelism: 10, fileParallelism: false })).toBe(1);
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
