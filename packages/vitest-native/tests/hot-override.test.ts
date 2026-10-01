import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  hotOverrideReason,
  pinInlineProjectRoots,
  vitestMaxWorkers,
  vitestRootOf,
} from "../src/plugin.js";

// Vitest 4 applies CLI flags after plugins' config hooks, so the hot runtime chosen
// there is re-checked against the resolved config. Anything that is not a reason
// must leave hot in place: an override that misfires reverts every run.
describe("hotOverrideReason", () => {
  const hotPool = { name: "vitest-native", createPoolWorker: () => undefined };
  const hot = { pool: hotPool, isolate: false, maxWorkers: 4 };

  it("keeps hot when the resolved config still holds it", () => {
    expect(hotOverrideReason(hot, {}, hotPool)).toBe(null);
    // Vitest resolves a pool initializer to its name.
    expect(hotOverrideReason({ ...hot, pool: "vitest-native" }, {}, hotPool)).toBe(null);
    expect(hotOverrideReason({ ...hot, pool: { name: "vitest-native" } }, {}, hotPool)).toBe(null);
    expect(hotOverrideReason({ ...hot, maxWorkers: 2 }, {}, hotPool)).toBe(null);
  });

  it("accepts a single worker when allowUnboundedMemory explicitly allows it", () => {
    expect(hotOverrideReason({ ...hot, maxWorkers: 1 }, {}, hotPool, true)).toBe(null);
    expect(hotOverrideReason({ ...hot, fileParallelism: false }, {}, hotPool, true)).toBe(null);
    // The other reasons still apply.
    expect(hotOverrideReason({ ...hot, pool: "forks" }, {}, hotPool, true)).toBe(
      "the pool 'forks' was set",
    );
  });

  it("names each override the hot runtime cannot honour", () => {
    expect(hotOverrideReason(hot, { isolate: false }, hotPool)).toBe("--no-isolate was passed");
    expect(hotOverrideReason(hot, { isolate: true }, hotPool)).toBe("--isolate was passed");
    expect(hotOverrideReason({ ...hot, pool: "forks" }, {}, hotPool)).toBe(
      "the pool 'forks' was set",
    );
    expect(hotOverrideReason({ ...hot, pool: { name: "other" } }, {}, hotPool)).toBe(
      "the pool 'custom' was set",
    );
    expect(hotOverrideReason({ ...hot, maxWorkers: 1 }, {}, hotPool)).toBe("maxWorkers is 1");
    expect(hotOverrideReason({ ...hot, fileParallelism: false }, {}, hotPool)).toBe(
      "file parallelism is off",
    );
  });
});

// Restored when 'auto' falls back after the memory plan capped the worker count.
describe("vitestMaxWorkers", () => {
  it("keeps the user's count or percentage", () => {
    expect(vitestMaxWorkers(3, false, 8)).toBe(3);
    expect(vitestMaxWorkers("5", false, 8)).toBe(5);
    expect(vitestMaxWorkers("50%", false, 8)).toBe(4);
    expect(vitestMaxWorkers("200%", false, 8)).toBe(8);
    expect(vitestMaxWorkers("1%", false, 8)).toBe(1);
  });

  it("otherwise uses Vitest's default for run and watch", () => {
    expect(vitestMaxWorkers(undefined, false, 8)).toBe(7);
    expect(vitestMaxWorkers(undefined, true, 8)).toBe(4);
    expect(vitestMaxWorkers(undefined, false, 1)).toBe(1);
    expect(vitestMaxWorkers(undefined, true, 1)).toBe(1);
  });
});

// Vitest 5 builds a server-sharing inline project's `test` options from the user's raw
// config, without this plugin's contributions; a pinned root gives it its own server.
describe("pinInlineProjectRoots", () => {
  it("pins inline entries without a root to the declaring root", () => {
    const test = {
      projects: ["packages/*", { extends: true }, { test: { name: "b" } }, { root: "own" }],
    };
    expect(pinInlineProjectRoots(test, "/repo")).toBe(2);
    expect(test.projects).toEqual([
      "packages/*",
      { extends: true, root: "/repo" },
      { test: { name: "b" }, root: "/repo" },
      { root: "own" },
    ]);
  });

  it("leaves configs without inline projects alone", () => {
    expect(pinInlineProjectRoots(undefined, "/repo")).toBe(0);
    expect(pinInlineProjectRoots({}, "/repo")).toBe(0);
    expect(pinInlineProjectRoots({ projects: ["a/*"] }, "/repo")).toBe(0);
  });
});

describe("vitestRootOf", () => {
  it("prefers test.root over root, as Vitest does", () => {
    expect(vitestRootOf({ root: "/a", test: { root: "/b" } })).toBe(path.resolve("/b"));
    expect(vitestRootOf({ root: "/a" })).toBe(path.resolve("/a"));
    expect(vitestRootOf({})).toBe(process.cwd());
    expect(vitestRootOf({ test: { root: "app" } })).toBe(path.resolve("app"));
  });
});
