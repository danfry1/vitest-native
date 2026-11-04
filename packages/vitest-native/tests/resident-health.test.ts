// Resident health (src/native/resident-health.mjs) and the pool's use of it: a hot
// worker that ends a task with resident state the per-file reset cannot restore is
// retired before it gets another task. The end-to-end gate is
// scripts/test-hot-act-scope.mjs; these pin the two halves without a worker.
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { residentProblems } from "../src/native/resident-health.mjs";
import { nativePool } from "../src/native/pool.js";

type Internals = { actQueue: unknown[] | null };

// A project with its own `react`, whose client internals the test controls.
function projectWithReact(): {
  root: string;
  load: () => { internals: Internals; react: { depth: number } };
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-resident-health-"));
  const react = path.join(root, "node_modules", "react");
  fs.mkdirSync(react, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"app"}');
  fs.writeFileSync(path.join(react, "package.json"), '{"name":"react","main":"index.js"}');
  fs.writeFileSync(
    path.join(react, "index.js"),
    [
      "const internals = { actQueue: null };",
      "exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = internals;",
      // React's act() at depth 0 flushes and clears the queue; inside an open scope
      // (exports.depth > 0) it leaves it.
      "exports.depth = 0;",
      "exports.act = (fn) => { fn(); if (exports.depth === 0) internals.actQueue = null; };",
    ].join("\n"),
  );
  const req = createRequire(path.join(root, "package.json"));
  return {
    root,
    load: () => {
      const exports = req("react");
      return {
        internals: exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
        react: exports,
      };
    },
  };
}

describe("residentProblems", () => {
  it("reports nothing while React is not loaded, and does not load it", () => {
    const project = projectWithReact();
    expect(residentProblems(project.root)).toEqual([]);
    const reactEntry = createRequire(path.join(project.root, "package.json")).resolve("react");
    expect((Module as unknown as { _cache: Record<string, unknown> })._cache[reactEntry]).toBe(
      undefined,
    );
  });

  it("reports an open act() scope on the loaded React, and nothing once it closes", () => {
    const project = projectWithReact();
    const { internals, react } = project.load();
    expect(residentProblems(project.root)).toEqual([]);
    react.depth = 1;
    internals.actQueue = [];
    expect(residentProblems(project.root)).toEqual([
      { id: "react.act-scope", message: "React's act() scope is still open", clearsOnItsOwn: true },
    ]);
    react.depth = 0;
    internals.actQueue = null;
    expect(residentProblems(project.root)).toEqual([]);
  });

  it("does not take a queue an act() left behind with no scope open for an open scope", () => {
    // An act() whose callback rejects closes its scope but leaves the queue non-null.
    const project = projectWithReact();
    const { internals } = project.load();
    const flag = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    internals.actQueue = [];
    expect(residentProblems(project.root)).toEqual([]);
    expect(internals.actQueue).toBe(null);
    // The act environment flag the check sets around its act() is put back as it was.
    expect(Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT")).toEqual(flag);
  });

  it("reads React 18's act queue too", () => {
    const project = projectWithReact();
    const reactEntry = createRequire(path.join(project.root, "package.json")).resolve("react");
    fs.writeFileSync(
      reactEntry,
      "exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = { ReactCurrentActQueue: { current: [] } };",
    );
    createRequire(path.join(project.root, "package.json"))("react");
    expect(residentProblems(project.root).map((p) => p.id)).toEqual(["react.act-scope"]);
  });
});

const packageRoot = path.resolve(import.meta.dirname, "..");
const poolOptions = {
  distPath: "/tmp/unused",
  project: { vitest: { logger: { outputStream: process.stdout, errorStream: process.stderr } } },
  method: "run" as const,
  environment: { name: "node", options: null },
  execArgv: [],
  env: {},
};
const task = { context: { environment: { name: "node", options: null } } };
const finished = (extra: Record<string, unknown> = {}) => ({
  __vitest_worker_response__: true,
  type: "testfileFinished",
  ...extra,
});

describe("hot pool: resident health", () => {
  const worker = () =>
    nativePool({
      workerEntry: path.resolve(packageRoot, "src/native/worker.mjs"),
      projectRoot: packageRoot,
    }).createPoolWorker(poolOptions as never) as never as {
      observeResponse(message: unknown): void;
      canReuse(task: unknown): boolean;
      send(message: unknown): void;
    };

  it("retires a worker whose task ended with a resident problem, and names it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = worker();
    try {
      w.send({ type: "run", context: { files: [{ filepath: "/app/a-hang.test.tsx" }] } });
    } catch {
      // No live thread: send records the files first, then throws.
    }
    w.observeResponse(finished());
    expect(w.canReuse(task)).toBe(true);
    w.observeResponse(
      finished({
        vitestNativeResidentProblems: [
          { id: "react.act-scope", message: "React's act() scope is still open" },
        ],
      }),
    );
    expect(w.canReuse(task)).toBe(false);
    expect(String(warn.mock.calls.at(-1)?.[0])).toMatch(
      /retiring a hot worker: React's act\(\) scope is still open \(react\.act-scope\) after a-hang\.test\.tsx/,
    );
    warn.mockRestore();
  });

  it("does not hold a worker's earlier problem against a later healthy task", () => {
    const w = worker();
    w.observeResponse(finished({ vitestNativeResidentProblems: [{ id: "x", message: "x" }] }));
    w.observeResponse(finished());
    expect(w.canReuse(task)).toBe(true);
  });

  it("ignores messages that are not a worker's task response", () => {
    const w = worker();
    w.observeResponse({ type: "testfileFinished", vitestNativeResidentProblems: [{ id: "x" }] });
    w.observeResponse(null);
    expect(w.canReuse(task)).toBe(true);
  });
});
