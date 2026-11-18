import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  hotOverrideReason,
  pinInlineProjectRoots,
  sharedGroupConflict,
  vitestMaxWorkers,
  vitestRootOf,
} from "../src/plugin.js";

// Vitest applies CLI flags after plugins' config hooks, so the hot runtime chosen
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

// Vitest throws when projects in one sequence.groupOrder resolve to different worker
// counts; a hot project capped by its memory plan must not create that mismatch.
describe("sharedGroupConflict", () => {
  const hot = { name: "native", config: { maxWorkers: 4 } };
  const project = (name: string, config: Record<string, unknown> = {}) => ({ name, config });

  it("names a project in the same group that resolves to a different worker count", () => {
    // Unset resolves to Vitest's default: one fewer than the CPUs (9 of 10).
    expect(sharedGroupConflict(hot, [hot, project("mock")], {}, 10)).toMatch(
      /'mock' is in the same sequence.groupOrder \(0\) with 9 workers to this project's 4/,
    );
    expect(sharedGroupConflict(hot, [project("web", { maxWorkers: 2 })], {}, 10)).toMatch(/'web'/);
    // The root config's worker count applies to a project that sets none.
    expect(sharedGroupConflict(hot, [project("mock")], { maxWorkers: 6 }, 10)).toMatch(/6 workers/);
  });

  it("allows matching worker counts, separate groups, and Vitest's sequential exemption", () => {
    expect(sharedGroupConflict(hot, [project("mock")], {}, 5)).toBe(null); // 5 CPUs → 4
    expect(sharedGroupConflict(hot, [project("mock", { maxWorkers: 4 })], {}, 10)).toBe(null);
    expect(
      sharedGroupConflict(hot, [project("mock", { sequence: { groupOrder: 1 } })], {}, 10),
    ).toBe(null);
    expect(
      sharedGroupConflict(
        { name: "native", config: { maxWorkers: 4, sequence: { groupOrder: 2 } } },
        [project("mock")],
        {},
        10,
      ),
    ).toBe(null);
    // Vitest runs an isolated single-worker project in the default group on its own.
    expect(
      sharedGroupConflict(hot, [project("serial", { isolate: true, maxWorkers: 1 })], {}, 10),
    ).toBe(null);
    expect(sharedGroupConflict(hot, [hot], {}, 10)).toBe(null);
  });

  // #911: a separate groupOrder runs the groups one after another, so the message
  // recommends one worker count for the whole group and names groupOrder second.
  it("recommends the same maxWorkers first, and groupOrder only as the serial alternative", () => {
    const reason = sharedGroupConflict(hot, [project("mock")], {}, 10) ?? "";
    const same = reason.indexOf("give every project in the group the same test.maxWorkers");
    const order = reason.indexOf("test.sequence.groupOrder");
    expect(same).toBeGreaterThan(-1);
    expect(order).toBeGreaterThan(same);
    expect(reason).toMatch(/groupOrder also works, but Vitest runs the groups one after another/);
    expect(reason).toContain(
      "https://vitest-native.danfry.dev/guide/hot-runtime#react-native-and-other-projects-in-one-run",
    );
    expect(reason).not.toMatch(/memory plan/);
  });

  it("names the count the memory plan admitted when it lowered only the hot project's", () => {
    const lowered = { name: "native", config: { maxWorkers: 2 } };
    const node = project("node", { maxWorkers: 4 });
    const reason = sharedGroupConflict(lowered, [node], {}, 10, {
      admitted: 2,
      requested: 4,
      flag: false,
    });
    expect(reason).toMatch(/'node' .* with 4 workers to this project's 2/);
    expect(reason).toMatch(
      /the memory plan admits 2 of the 4 workers requested on this machine; give every project in the group the same test.maxWorkers, one the smallest machine you run on admits/,
    );
  });

  it("asks for a smaller --maxWorkers when the flag set the count every project runs", () => {
    const lowered = { name: "native", config: { maxWorkers: 4 } };
    const reason = sharedGroupConflict(lowered, [project("node", { maxWorkers: 8 })], {}, 10, {
      admitted: 4,
      requested: 8,
      flag: true,
    });
    expect(reason).toMatch(
      /the memory plan admits 4 of the 8 workers requested on this machine; every project takes the --maxWorkers or VITEST_MAX_WORKERS count, so pass 4 or fewer here/,
    );
    expect(reason).not.toMatch(/same test.maxWorkers/);
  });
});
