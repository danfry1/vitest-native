/**
 * What the Expo SDK check costs a config load: nothing a count can see. Where `expo` does
 * not resolve from the project, the check reads the copies of expo and expo-modules-core
 * the native engine's detection already reaches (installedExpoSdk), so detection, and
 * config() with configResolved, must make the same file reads, stats and resolutions as
 * they do without it. Counted on projects where the check falls back to detection and
 * every Expo package is met once (the other copies cost one lookup each; see
 * detectEcosystemPackages' `reachedCopies`).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { expoWorkspace, removeWorkspaces, type ExpoWorkspace } from "./expo-fixtures.js";

// `baseline` stands for the release before the check read detection: detection is run
// without `reachedCopies`, and the check reads only the project root.
const switches = vi.hoisted(() => ({ baseline: false, detections: 0, rootChecks: 0 }));

vi.mock("../src/native/ecosystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/native/ecosystem.js")>();
  return {
    ...actual,
    detectEcosystemPackages: (...args: Parameters<typeof actual.detectEcosystemPackages>) => {
      switches.detections++;
      if (switches.baseline && args[6]) {
        const { reachedCopies: _, ...rest } = args[6];
        args[6] = rest;
      }
      return actual.detectEcosystemPackages(...args);
    },
  };
});
vi.mock("../src/peer-requirements.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/peer-requirements.js")>();
  return {
    ...actual,
    installedExpoVersion: (...args: Parameters<typeof actual.installedExpoVersion>) => {
      switches.rootChecks++;
      return actual.installedExpoVersion(...args);
    },
    installedExpoSdk: (...args: Parameters<typeof actual.installedExpoSdk>) =>
      switches.baseline ? actual.installedExpoSdk(args[0]) : actual.installedExpoSdk(...args),
  };
});

const { detectEcosystemPackages } = await import("../src/native/ecosystem.js");
const { dependencyDirOf } = await import("../src/native/match.mjs");
const { EXPO_SDK_PACKAGES } = await import("../src/peer-requirements.js");
const { reactNative } = await import("../src/plugin.js");

const Module = createRequire(import.meta.url)("node:module") as Record<string, unknown>;

/** File reads, stats, existence probes and module resolutions while `run` runs. */
async function count(run: () => unknown): Promise<Record<string, number>> {
  const spies = {
    readFileSync: vi.spyOn(fs, "readFileSync"),
    statSync: vi.spyOn(fs, "statSync"),
    lstatSync: vi.spyOn(fs, "lstatSync"),
    existsSync: vi.spyOn(fs, "existsSync"),
    realpathSync: vi.spyOn(fs, "realpathSync"),
    resolveFilename: vi.spyOn(Module as { _resolveFilename: () => unknown }, "_resolveFilename"),
  };
  try {
    await run();
    // Read before restoring: mockRestore clears the recorded calls.
    return Object.fromEntries(
      Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]),
    );
  } finally {
    for (const spy of Object.values(spies)) spy.mockRestore();
  }
}

// Packages whose Expo copies are each met once. stale-kit, old-ui and nested-old-core
// meet a second copy, which is the one lookup per copy the check is allowed.
const SINGLE_COPY: ExpoWorkspace[] = ["expo-thing", "supported-core", "ui-kit", "nothing"];
// Where `expo` resolves from the project the check records nothing, so an Expo app, whose
// modules all peer expo, pays no lookup for it either.
const LOADS: ExpoWorkspace[] = [...SINGLE_COPY, "expo-app"];

beforeAll(() => {
  // A config call would otherwise compile React Native's registry (seconds, and file
  // reads the check has nothing to do with).
  vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
});
afterEach(() => {
  switches.baseline = false;
  vi.restoreAllMocks();
});
afterAll(() => {
  vi.unstubAllEnvs();
  removeWorkspaces();
});

describe("detection, recording the Expo copies it reaches", () => {
  it.each(SINGLE_COPY)(
    "makes the same lookups, reads and resolutions as without (%s)",
    async (kind) => {
      const lib = expoWorkspace(kind);
      const lookups: string[][] = [[], []];
      const run = (index: number, record: boolean) => () =>
        detectEcosystemPackages(
          [lib],
          [],
          [],
          [],
          [],
          (name, from) => {
            lookups[index].push(`${name} ${from}`);
            return dependencyDirOf(name, from);
          },
          record ? { reachedCopies: { of: EXPO_SDK_PACKAGES, found: [] } } : {},
        );
      run(0, false)(); // warm Node's own caches for both runs alike
      lookups[0].length = 0;
      const without = await count(run(0, false));
      const recording = await count(run(1, true));
      expect(without.readFileSync).toBeGreaterThan(0);
      expect(without.resolveFilename).toBeGreaterThan(0);
      expect(recording).toEqual(without);
      expect(lookups[1]).toEqual(lookups[0]);
    },
  );
});

describe("a config load under the native engine", () => {
  async function load(lib: string) {
    const plugin = reactNative({ engine: "native" }) as any;
    const vite = (await import("vite")) as { version: string };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await plugin.config.handler.call(
      { meta: { viteVersion: vite.version } },
      { root: lib },
      { command: "serve", mode: "test" },
    );
    await plugin.configResolved({ root: lib, plugins: [], test: {} });
  }

  it.each(LOADS)("costs what it did before the Expo check read detection (%s)", async (kind) => {
    await load(expoWorkspace(kind)); // module-level caches warm up on the shared toolchain
    switches.baseline = true;
    switches.detections = 0;
    const before = await count(() => load(expoWorkspace(kind)));
    const detectionsBefore = switches.detections;
    switches.baseline = false;
    switches.detections = 0;
    switches.rootChecks = 0;
    const after = await count(() => load(expoWorkspace(kind)));
    // Detection runs once per load, as before; the check runs no pass of its own.
    expect(detectionsBefore).toBe(1);
    expect(switches.detections).toBe(1);
    // The project root is resolved for `expo` once, in config(), and read again after.
    expect(switches.rootChecks).toBe(1);
    expect(before.readFileSync).toBeGreaterThan(0);
    expect(before.resolveFilename).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });
});
