import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactNative } from "../src/index.js";
import {
  assertHostResolvesRunningVitest,
  assertHotWorkerLoadsRunningVitest,
  installedViteVersion,
  ownVitestPackage,
  runningViteVersion,
} from "../src/host.js";
import { validatePeerDependency } from "../src/validate.js";
import { runInit } from "../src/cli/init.js";
import { runDoctor } from "../src/cli/doctor.js";
import { viteMajor } from "../src/cli/babel-config.js";
import { analyzeJestConfig } from "../src/cli/migrate.js";
import { contextOf } from "./project-context-helpers.js";

// vitest-native binds to the Vite and Vitest that are running, not to the packages a
// lookup by name finds from the project root (src/host.ts, issue #354). Under Vite+ the
// package named `vite` is VoidZero's core: its manifest states 1.3.0 while the module
// reports the Vite it bundles. And Vite+ brings `vitest` itself, so a pnpm project root
// may not resolve `vitest` at all. These fixtures reproduce both shapes without
// installing anything.
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromPackage = createRequire(path.join(PACKAGE_ROOT, "package.json"));
const REAL_REACT = path.dirname(fromPackage.resolve("react/package.json"));
const REAL_VITE = path.dirname(fromPackage.resolve("vite/package.json"));
const SERVE = { command: "serve", mode: "test" };
const temps: string[] = [];

function project(files: Record<string, string | object>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-host-"));
  temps.push(root);
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

function link(root: string, name: string, target: string): void {
  fs.mkdirSync(path.dirname(path.join(root, "node_modules", name)), { recursive: true });
  fs.symlinkSync(target, path.join(root, "node_modules", name), "dir");
}

/**
 * A project whose `vite` is shaped like Vite+'s core (manifest 1.3.0, module 8.3.4),
 * with React and no `vitest` at its root. The manifest carries no `bundledVersions`,
 * so a diagnostic passes only by reading the module.
 */
function vitePlusProject(extra: Record<string, string | object> = {}): string {
  const root = project({
    "package.json": { name: "app", devDependencies: { "vite-plus": "1.3.0" } },
    "node_modules/vite/package.json": {
      name: "@voidzero-dev/vite-plus-core",
      version: "1.3.0",
      main: "index.cjs",
    },
    "node_modules/vite/index.cjs": "exports.version = '8.3.4';\n",
    "node_modules/vite-plus/package.json": { name: "vite-plus", version: "1.3.0" },
    ...extra,
  });
  link(root, "react", REAL_REACT);
  return root;
}

/** An Expo-shaped project with a tsconfig `paths` alias, under the Vite+ layout. */
function expoVitePlusProject(): string {
  return vitePlusProject({
    "package.json": {
      name: "app",
      dependencies: { expo: "57.0.0" },
      devDependencies: { "vite-plus": "1.3.0" },
    },
    "tsconfig.json": { compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } },
    "src/greet.ts": "export const greet = () => 'hi';\n",
  });
}

/** The plugin's config() result, run as Vite reports the given version. */
async function configUnder(plugin: any, viteVersion: string, root: string) {
  return plugin.config.handler.call({ meta: { viteVersion } }, { root }, SERVE);
}

/** The code and message of the error `fn` throws or rejects with. */
async function failure(fn: () => unknown): Promise<{ code?: string; message: string }> {
  try {
    await fn();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error("expected a failure");
}

const quiet = () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("the running Vite", () => {
  it("is read from the host's context when Vite states it", async () => {
    await expect(runningViteVersion({ meta: { viteVersion: "8.3.4" } })).resolves.toBe("8.3.4");
  });

  it("falls back to the vite module's own version export", async () => {
    const vite = (await import("vite")) as { version: string };
    await expect(runningViteVersion(undefined)).resolves.toBe(vite.version);
  });

  it("is read from the module, not the manifest, for diagnostics", () => {
    expect(installedViteVersion(vitePlusProject())).toBe("8.3.4");
    expect(viteMajor(vitePlusProject())).toBe(8);
  });

  it("passes the peer check under Vite+, where the manifest names the wrapper's version", () => {
    const root = vitePlusProject();
    // The lookup by name is the bug: it finds 1.3.0.
    expect(validatePeerDependency("vite", "6.4.2", root, 9)).toMatch(/found 1\.3\.0/);
    expect(validatePeerDependency("vite", "6.4.2", root, 9, undefined, "8.3.4")).toBeNull();
  });

  it("names which Vite it measured when the running one is too old", () => {
    expect(
      validatePeerDependency(
        "vite",
        "6.4.2",
        PACKAGE_ROOT,
        9,
        undefined,
        "6.0.0",
        "the running Vite",
      ),
    ).toMatch(/found 6\.0\.0 \(the running Vite\)/);
  });

  it("decides the JSX transform and Expo's tsconfig paths from the running version", async () => {
    quiet();
    const root = expoVitePlusProject();
    const eight = await configUnder(reactNative({ engine: "mock" }) as any, "8.3.4", root);
    expect(eight.oxc).toBeDefined();
    expect(eight.resolve?.tsconfigPaths).toBe(true);
    expect(JSON.stringify(contextOf(eight).requireAliases)).toContain("@/");
    const seven = await configUnder(reactNative({ engine: "mock" }) as any, "7.3.2", root);
    expect(seven.esbuild).toEqual({ jsx: "automatic" });
    expect(seven.resolve?.tsconfigPaths).toBeUndefined();
    expect(contextOf(seven).requireAliases).toBeUndefined();
  });
});

describe("starting the plugin", () => {
  it("starts in a Vite+ project with no vitest at its root", async () => {
    quiet();
    const root = vitePlusProject();
    const plugin = reactNative({ engine: "mock" }) as any;
    await configUnder(plugin, "8.3.4", root);
    await expect(plugin.configResolved({ root, plugins: [], test: {} })).resolves.toBeUndefined();
  });

  it("checks Vite by the running version, with vitest present at the root", async () => {
    quiet();
    const root = vitePlusProject();
    link(root, "vitest", ownVitestPackage()!.root);
    const plugin = reactNative({ engine: "mock" }) as any;
    await configUnder(plugin, "8.3.4", root);
    await expect(plugin.configResolved({ root, plugins: [], test: {} })).resolves.toBeUndefined();
  });

  it("leaves a vitest the project root cannot resolve to configureVitest", async () => {
    quiet();
    const root = project({ "package.json": { name: "app" } });
    link(root, "react", REAL_REACT);
    link(root, "vite", REAL_VITE);
    const plugin = reactNative({ engine: "mock" }) as any;
    await configUnder(plugin, (await import("vite")).version, root);
    await expect(plugin.configResolved({ root, plugins: [], test: {} })).resolves.toBeUndefined();
  });

  it("still refuses a Vitest 3 found at the project root, by name", async () => {
    quiet();
    const root = project({
      "package.json": { name: "app" },
      "node_modules/vitest/package.json": { name: "vitest", version: "3.0.9" },
    });
    link(root, "react", REAL_REACT);
    link(root, "vite", REAL_VITE);
    const plugin = reactNative({ engine: "mock" }) as any;
    await configUnder(plugin, (await import("vite")).version, root);
    const error = await failure(() => plugin.configResolved({ root, plugins: [], test: {} }));
    expect(error.code).toBe("UNSUPPORTED_PEER");
    expect(error.message).toMatch(/vitest >= 4\.0\.0.*found 3\.0\.9/);
  });

  it("defaults Vitest 5's module cache from the copy it binds to when the root has none", async () => {
    quiet();
    expect(Number(ownVitestPackage()!.version.split(".")[0])).toBeGreaterThanOrEqual(5);
    const result = await configUnder(
      reactNative({ engine: "mock" }) as any,
      "8.3.4",
      vitePlusProject(),
    );
    expect(result.test.fsModuleCache).toBe(true);
  });
});

describe("the running Vitest", () => {
  const own = ownVitestPackage()!;
  const running = { distPath: path.join(own.root, "dist"), version: own.version };
  const ownEntry = path.join(own.root, "dist/index.js");
  const twinCopy = () =>
    project({
      "node_modules/vitest/package.json": { name: "vitest", version: own.version },
      "node_modules/vitest/dist/index.js": "",
    });

  it("is accepted when the host resolves vitest-native's import to it", async () => {
    await expect(
      assertHostResolvesRunningVitest(running, async () => ownEntry, __filename),
    ).resolves.toBeUndefined();
  });

  it("is refused by name when the host resolves another copy", async () => {
    const twin = twinCopy();
    const error = await failure(() =>
      assertHostResolvesRunningVitest(
        running,
        async () => ({ id: path.join(twin, "node_modules/vitest/dist/index.js") }),
        __filename,
      ),
    );
    expect(error.code).toBe("VITEST_TWIN_INSTANCE");
    expect(error.message).toContain(fs.realpathSync.native(path.join(twin, "node_modules/vitest")));
  });

  it("is refused for the hot worker when Node would load another copy beside it", async () => {
    const twin = twinCopy();
    const error = await failure(() =>
      assertHotWorkerLoadsRunningVitest(running, path.join(twin, "worker.mjs")),
    );
    expect(error.code).toBe("VITEST_TWIN_INSTANCE");
    expect(error.message).toContain("hotRuntime: false");
    expect(() =>
      assertHotWorkerLoadsRunningVitest(running, path.join(PACKAGE_ROOT, "src/native/worker.mjs")),
    ).not.toThrow();
  });

  it("is one copy when reached through a symlink, as pnpm and bun lay it out", async () => {
    const linked = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vn-host-link-")), "vitest");
    temps.push(path.dirname(linked));
    fs.symlinkSync(own.root, linked, "dir");
    await expect(
      assertHostResolvesRunningVitest(
        { distPath: path.join(linked, "dist"), version: own.version },
        async () => ownEntry,
        __filename,
      ),
    ).resolves.toBeUndefined();
  });

  async function configured(engine: "mock" | "native") {
    quiet();
    const plugin = reactNative({ engine }) as any;
    const result = await configUnder(plugin, (await import("vite")).version, PACKAGE_ROOT);
    return { plugin, setupFiles: result.test.setupFiles };
  }

  it("is refused by configureVitest when the host resolves a twin, for either engine", async () => {
    const twin = twinCopy();
    for (const engine of ["mock", "native"] as const) {
      const { plugin, setupFiles } = await configured(engine);
      const error = await failure(() =>
        plugin.configureVitest({
          vitest: { ...running, config: { cliOptions: {} } },
          project: {
            config: { root: PACKAGE_ROOT, setupFiles },
            vite: {
              pluginContainer: {
                resolveId: async () => path.join(twin, "node_modules/vitest/dist/index.js"),
              },
            },
          },
        }),
      );
      expect(error.code).toBe("VITEST_TWIN_INSTANCE");
    }
  });

  it("accepts a second physical copy the host does not resolve to", async () => {
    // Peer-variant installs keep two copies of the same version; Vitest's own resolver
    // maps vitest-native's setup import to the running one.
    const { plugin, setupFiles } = await configured("native");
    await expect(
      plugin.configureVitest({
        vitest: { ...running, config: { cliOptions: {} } },
        project: {
          config: { root: PACKAGE_ROOT, setupFiles },
          vite: { pluginContainer: { resolveId: async () => ownEntry } },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("is checked against the supported range by its own version", async () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    const error = await failure(() =>
      plugin.configureVitest({
        vitest: { version: "3.2.0", distPath: running.distPath, config: { cliOptions: {} } },
        project: { config: { root: PACKAGE_ROOT } },
      }),
    );
    expect(error.code).toBe("UNSUPPORTED_PEER");
    expect(error.message).toMatch(/vitest >= 4\.0\.0.*found 3\.2\.0/);
  });
});

describe("doctor, init and migrate under Vite+", () => {
  it("doctor reports the bundled Vite, and Vitest from where vitest-native loads it", () => {
    const text = runDoctor(vitePlusProject()).lines.join("\n");
    expect(text).toContain(`✓ vite 8.3.4`);
    expect(text).toContain(`✓ vitest ${ownVitestPackage()!.version}`);
    expect(text).not.toMatch(/found 1\.3\.0/);
  });

  it("doctor still reports a missing vitest outside Vite+", () => {
    const root = project({ "package.json": { name: "app" } });
    link(root, "react", REAL_REACT);
    link(root, "vite", REAL_VITE);
    expect(runDoctor(root).lines.join("\n")).toMatch(/vitest .*not found/);
  });

  it("init writes a Vite+ config and points to vp test", () => {
    const root = project({
      "package.json": { name: "app" },
      "node_modules/vite-plus/package.json": { name: "vite-plus", version: "1.3.0" },
    });
    const result = runInit(root);
    expect(result.wrote).toBe("vite.config.ts");
    const written = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
    expect(written).toContain("import { defineConfig } from 'vite-plus'");
    expect(written).not.toContain("vitest/config");
    expect(result.lines.join("\n")).toContain("vp test");
  });

  it("init adds to an existing Vite+ config instead of offering to replace it", () => {
    const root = project({
      "package.json": { name: "app" },
      "node_modules/vite-plus/package.json": { name: "vite-plus", version: "1.3.0" },
      "vite.config.ts": "export default {}\n",
    });
    const result = runInit(root);
    expect(result.ok).toBe(false);
    const text = result.lines.join("\n");
    expect(text).toContain("plugins: [reactNative()]");
    expect(text).not.toContain("--force");
    expect(fs.readFileSync(path.join(root, "vite.config.ts"), "utf8")).toBe("export default {}\n");
  });

  it("migrate suggests the Vite+ config shape", () => {
    const root = vitePlusProject({
      "package.json": {
        name: "app",
        devDependencies: { "vite-plus": "1.3.0" },
        jest: { preset: "react-native" },
      },
    });
    const report = analyzeJestConfig(root);
    expect(report.suggestedConfig).toContain("import { defineConfig } from 'vite-plus'");
    expect(report.suggestedConfig).not.toContain("vitest/config");
  });
});
