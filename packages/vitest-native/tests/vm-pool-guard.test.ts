import { describe, it, expect } from "vitest";
import { reactNative } from "../src/index.js";
import { runPluginConfig } from "./plugin-config.js";
describe("native engine on a VM pool", () => {
  for (const pool of ["vmThreads", "vmForks"] as const) {
    it(`refuses ${pool} with an explanation`, async () => {
      const plugin = reactNative({ engine: "native" }) as any;
      await expect(runPluginConfig(plugin, { test: { pool } })).rejects.toThrow(
        new RegExp(`cannot run on the '${pool}' pool`),
      );
    });
  }
  it("allows forks", async () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const config = await runPluginConfig(plugin, { test: { pool: "forks" } });
    expect(config.test.pool).toBe("forks");
  });
});
