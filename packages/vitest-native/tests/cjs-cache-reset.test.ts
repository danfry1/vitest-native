import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

describe("hot CJS cache compatibility", () => {
  it.each([
    ["module semantics", "test-node-cjs-reset.mjs"],
    ["cleanup safety", "test-node-cjs-drain-contract.mjs"],
  ])("preserves %s in a real Node process", (_name, file) => {
    const result = spawnSync(
      process.execPath,
      ["--test", path.join(root, "validation/module-isolation", file)],
      {
        encoding: "utf8",
        timeout: 20_000,
        env: { ...process.env, VN_CJS_DRAIN_RESEARCH: "1" },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
