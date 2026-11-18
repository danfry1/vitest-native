/**
 * The message 'auto' prints when the hot runtime turns off because another project in
 * its sequence.groupOrder runs a different worker count, and the memory plan made the
 * difference (#911). Projects given the same `maxWorkers` in their config files end up
 * different on a machine with less memory: config() lowers only the hot project's count.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { reactNative } from "../src/index.js";
import { runPluginConfig } from "./plugin-config.js";

const SERVE_ENV = { command: "serve", mode: "test" } as const;
const GIB = 1024 ** 3;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A small app with React Native, as in native-unit.test.ts's routing tests: routing does
// not read the registry, so it is left out (VITEST_NATIVE_NO_REGISTRY).
let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-hot-group-"));
  for (const name of ["react-native", "@react-native/babel-preset", "@babel/core", "vitest"]) {
    const to = path.join(root, "node_modules", name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.symlinkSync(fs.realpathSync(path.join(projectRoot, "node_modules", name)), to, "junction");
  }
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});
afterEach(() => vi.restoreAllMocks());

const host = (bytes: number, cpus: number) => {
  vi.spyOn(os, "totalmem").mockReturnValue(bytes);
  vi.spyOn(process, "constrainedMemory").mockReturnValue(0);
  vi.spyOn(os, "availableParallelism").mockReturnValue(cpus);
};

/** A hot project from config() and the conflict configureVitest reports beside `other`. */
async function clash(
  hotRuntime: unknown,
  test: Record<string, unknown>,
  other: Record<string, unknown>,
) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const plugin = reactNative({ engine: "native", hotRuntime } as any) as any;
  const cfg = await runPluginConfig(plugin, { root, test }, SERVE_ENV);
  const config = { root, ...cfg.test };
  const self = { name: "native", config };
  const hotWorkers = config.maxWorkers;
  let thrown: unknown;
  try {
    plugin.configureVitest({
      vitest: { config: { cliOptions: {} }, projects: [self, { name: "node", config: other }] },
      project: self,
    });
  } catch (error) {
    thrown = error;
  }
  const logged = err.mock.calls.map((call) => String(call[0])).join("\n");
  const code = (thrown as { code?: string } | undefined)?.code;
  return { config, hotWorkers, logged, code, thrown: thrown === undefined ? "" : String(thrown) };
}

describe("hot runtime off for a group conflict the memory plan made", () => {
  it("names the admitted count when config() lowered the configured maxWorkers", async () => {
    // 2 GiB admits four workers, so the eight both projects set becomes four here.
    host(2 * GIB, 10);
    const { config, hotWorkers, logged } = await clash(
      "auto",
      { maxWorkers: 8 },
      { maxWorkers: 8 },
    );
    expect(hotWorkers).toBe(4);
    expect(config.isolate).toBe(true);
    expect(logged).toMatch(
      /hot runtime off: the project 'node'.*8 workers to this project's 4.*the memory plan admits 4 of the 8 workers requested on this machine; give every project in the group the same test\.maxWorkers, one the smallest machine you run on admits/,
    );
  });

  it("names it when memory lowered a count nobody set", async () => {
    // A 4-CPU runner: Vitest's default is three; 1.25 GiB admits two.
    host(1.25 * GIB, 4);
    const { hotWorkers, logged } = await clash("auto", {}, {});
    expect(hotWorkers).toBe(2);
    expect(logged).toMatch(
      /the project 'node'.*3 workers to this project's 2.*the memory plan admits 2 of the 3 workers requested on this machine; give every project in the group the same test\.maxWorkers/,
    );
  });

  it("leaves the plan unnamed when the automatic cap of four chose the count", async () => {
    host(64 * GIB, 10);
    const { hotWorkers, logged } = await clash("auto", {}, {});
    expect(hotWorkers).toBe(4);
    expect(logged).toMatch(
      /the project 'node'.*9 workers to this project's 4.*\(give every project in the group the same test\.maxWorkers\. A distinct/,
    );
    expect(logged).not.toMatch(/memory plan/);
  });

  it("gives hotRuntime: true the same remedy, and nothing else to remove", async () => {
    host(2 * GIB, 10);
    const { code, thrown } = await clash(true, { maxWorkers: 8 }, { maxWorkers: 8 });
    expect(code).toBe("HOT_RUNTIME_OVERRIDDEN");
    expect(thrown).toMatch(
      /hotRuntime was requested, but the project 'node'.*the memory plan admits 4 of the 8 workers requested on this machine; give every project in the group the same test\.maxWorkers.*See https:\/\/\S+\)\.$/,
    );
    expect(thrown).not.toMatch(/Remove that setting|cannot honour/);
  });
});
