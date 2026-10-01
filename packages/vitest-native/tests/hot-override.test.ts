import { describe, expect, it } from "vitest";
import { hotOverrideReason } from "../src/plugin.js";

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
