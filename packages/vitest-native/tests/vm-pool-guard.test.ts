import { describe, it, expect } from "vitest";
import { reactNative } from "../src/index.js";
describe("native engine on a VM pool", () => {
  for (const pool of ["vmThreads", "vmForks"] as const) {
    it(`refuses ${pool} with an explanation`, async () => {
      const plugin = reactNative({ engine: "native" }) as any;
      await expect(
        Promise.resolve(plugin.config({ test: { pool } }, { command: "serve", mode: "test" })),
      ).rejects.toThrow(new RegExp(`cannot run on the '${pool}' pool`));
    });
  }
  it("allows forks", async () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const config = await plugin.config(
      { test: { pool: "forks" } },
      { command: "serve", mode: "test" },
    );
    expect(config.test.pool).toBe("forks");
  });
});
