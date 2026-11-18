/**
 * What the guide tells a run that mixes reactNative() projects with node or web
 * projects: which projects get the transform cache, and how to keep the hot runtime
 * when the projects share one sequence.groupOrder.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveConfig, version } from "vitest/node";
import { satisfiesNodeRange } from "../src/node-range";
import { PEER_REQUIREMENTS } from "../src/peer-requirements";
import { sharedGroupConflict } from "../src/plugin.js";

const page = (name: string) =>
  fs.readFileSync(
    fileURLToPath(new URL(`../../../website/guide/${name}`, import.meta.url)),
    "utf8",
  );

describe("how-it-works.md: the transform cache in other projects", () => {
  const text = page("how-it-works.md");

  it("starts the off-by-default window at the lowest supported Vitest", () => {
    expect(text).toContain("On Vitest 5.0.0 to 5.0.3 the cache is off unless a project sets it");
    const vitest = PEER_REQUIREMENTS.find((p) => p.name === "vitest");
    expect(vitest?.minimum).toBe("5.0.0");
  });

  it("says Vitest turns it on everywhere from 5.0.4, as the locked Vitest does", async () => {
    expect(text).toContain("From Vitest 5.0.4, Vitest turns it on in every project by default");
    expect(satisfiesNodeRange(version, ">=5.0.4")).toBe(true);
    // A project without the plugin and without the option: Vitest's own default.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-fs-cache-"));
    try {
      const unset = await resolveConfig({ root, config: false });
      expect(unset.test?.fsModuleCache).toBe(true);
      const off = await resolveConfig({ root, config: false, fsModuleCache: false });
      expect(off.test?.fsModuleCache).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("hot-runtime.md: React Native and other projects in one run", () => {
  const text = page("hot-runtime.md");
  const section = text.slice(text.indexOf("### React Native and other projects in one run"));
  const hot = (maxWorkers: number) => ({ name: "native", config: { maxWorkers } });
  const node = { name: "node", config: { maxWorkers: 4 } };

  it("keeps the hot runtime when every project runs the same maxWorkers", () => {
    expect(section).toContain("give every project the same explicit `test.maxWorkers`");
    expect(sharedGroupConflict(hot(4), [hot(4), node], {}, 10)).toBe(null);
  });

  it("names the clash when the memory plan lowers only the hot project's count", () => {
    expect(section).toContain("fails with [`HOT_RUNTIME_OVERRIDDEN`]");
    expect(sharedGroupConflict(hot(2), [hot(2), node], {}, 10)).toMatch(
      /'node' is in the same sequence.groupOrder \(0\) with 4 workers to this project's 2/,
    );
  });
});
