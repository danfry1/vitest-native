import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactNative } from "../src/index.js";
import {
  assertRunningVitestIsOwn,
  installedViteVersion,
  ownVitestPackage,
  runningViteVersion,
} from "../src/host.js";
import { validatePeerDependency } from "../src/validate.js";
import { runInit } from "../src/cli/init.js";
import { runDoctor } from "../src/cli/doctor.js";

// vitest-native binds to the Vite and Vitest that are running, not to the packages a
// lookup by name finds from the project root (src/host.ts, issue #354). Under Vite+ the
// package named `vite` is VoidZero's core: its manifest states 1.3.0 while the module
// reports the Vite it bundles. And Vite+ brings `vitest` itself, so a pnpm project root
// may not resolve `vitest` at all. These fixtures reproduce both shapes without
// installing anything.
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_REACT = path.dirname(
  createRequire(path.join(PACKAGE_ROOT, "package.json")).resolve("react/package.json"),
);
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

/** A project whose `vite` is shaped like Vite+'s core, with React and no `vitest`. */
function vitePlusProject(): string {
  const root = project({
    "package.json": { name: "app", devDependencies: { "vite-plus": "1.3.0" } },
    "node_modules/vite/package.json": {
      name: "@voidzero-dev/vite-plus-core",
      version: "1.3.0",
      main: "index.cjs",
      bundledVersions: { vite: "8.3.4" },
    },
    "node_modules/vite/index.cjs": "exports.version = '8.3.4';\n",
    "node_modules/vite-plus/package.json": { name: "vite-plus", version: "1.3.0" },
  });
  fs.symlinkSync(REAL_REACT, path.join(root, "node_modules/react"), "dir");
  return root;
}

/** The code of the VitestNativeError `fn` throws, and its message. */
function thrown(fn: () => unknown): { code?: string; message: string } {
  try {
    fn();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error("expected a throw");
}

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
  });

  it("passes the peer check under Vite+, where the manifest names the wrapper's version", () => {
    const root = vitePlusProject();
    // The lookup by name is the bug: it finds 1.3.0.
    expect(validatePeerDependency("vite", "6.4.2", root, 9)).toMatch(/found 1\.3\.0/);
    expect(validatePeerDependency("vite", "6.4.2", root, 9, undefined, "8.3.4")).toBeNull();
  });

  it("lets the plugin start in a Vite+ project with no vitest at its root", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = vitePlusProject();
    const plugin = reactNative({ engine: "mock" }) as any;
    await plugin.config.handler.call(
      { meta: { viteVersion: "8.3.4" } },
      { root },
      { command: "serve", mode: "test" },
    );
    await expect(plugin.configResolved({ root, plugins: [], test: {} })).resolves.toBeUndefined();
  });
});

describe("the running Vitest", () => {
  const own = ownVitestPackage()!;

  it("is this package's own copy in this repository", () => {
    expect(own).not.toBeNull();
    expect(() =>
      assertRunningVitestIsOwn({ distPath: path.join(own.root, "dist"), version: own.version }),
    ).not.toThrow();
  });

  it("is one copy when reached through a symlink, as pnpm and bun lay it out", () => {
    const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vn-host-link-")), "vitest");
    temps.push(path.dirname(link));
    fs.symlinkSync(own.root, link, "dir");
    expect(() =>
      assertRunningVitestIsOwn({ distPath: path.join(link, "dist"), version: own.version }),
    ).not.toThrow();
  });

  it("fails fast by name when a second physical copy is running", () => {
    const twin = project({
      "node_modules/vitest/package.json": { name: "vitest", version: own.version },
      "node_modules/vitest/dist/index.js": "",
    });
    const error = thrown(() =>
      assertRunningVitestIsOwn({
        distPath: path.join(twin, "node_modules/vitest/dist"),
        version: own.version,
      }),
    );
    expect(error.code).toBe("VITEST_TWIN_INSTANCE");
    expect(error.message).toContain(fs.realpathSync(path.join(twin, "node_modules/vitest")));
    expect(error.message).toContain(own.root);
  });

  it("is refused by configureVitest when it is a twin, for either engine", () => {
    const twin = project({
      "node_modules/vitest/package.json": { name: "vitest", version: own.version },
      "node_modules/vitest/dist/index.js": "",
    });
    for (const engine of ["mock", "native"] as const) {
      const plugin = reactNative({ engine }) as any;
      const error = thrown(() =>
        plugin.configureVitest({
          vitest: {
            version: own.version,
            distPath: path.join(twin, "node_modules/vitest/dist"),
            config: { cliOptions: {} },
          },
          project: { config: { root: PACKAGE_ROOT } },
        }),
      );
      expect(error.code).toBe("VITEST_TWIN_INSTANCE");
    }
  });

  it("is checked against the supported range by its own version", () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    const error = thrown(() =>
      plugin.configureVitest({
        vitest: {
          version: "3.2.0",
          distPath: path.join(own.root, "dist"),
          config: { cliOptions: {} },
        },
        project: { config: { root: PACKAGE_ROOT } },
      }),
    );
    expect(error.code).toBe("UNSUPPORTED_PEER");
    expect(error.message).toMatch(/vitest >= 4\.0\.0.*found 3\.2\.0/);
  });
});

describe("doctor and init under Vite+", () => {
  it("doctor reports the bundled Vite, and Vitest from where vitest-native loads it", () => {
    const root = vitePlusProject();
    const { lines } = runDoctor(root);
    const text = lines.join("\n");
    expect(text).toContain(`✓ vite 8.3.4`);
    expect(text).toContain(`✓ vitest ${ownVitestPackage()!.version}`);
    expect(text).not.toMatch(/vite >= .*found 1\.3\.0/);
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

  it("init leaves an existing Vite+ config alone", () => {
    const root = project({
      "package.json": { name: "app" },
      "node_modules/vite-plus/package.json": { name: "vite-plus", version: "1.3.0" },
      "vite.config.ts": "export default {}\n",
    });
    expect(runInit(root).ok).toBe(false);
  });
});
