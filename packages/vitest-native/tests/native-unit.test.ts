import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
// @ts-expect-error — runtime .mjs, no types
import { transformRN } from "../src/native/transform.mjs";

// Anchor all resolution to THIS test file's location (cwd-independent — vitest's
// process.cwd() varies with where it was launched). Walk up from here looking for
// a directory containing the target.
const HERE = path.dirname(fileURLToPath(import.meta.url));
function findUp(rel: string, start: string): string {
  let dir = start;
  for (;;) {
    const candidate = path.join(dir, rel);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${rel} not found from ${start}`);
    dir = parent;
  }
}

// Resolve react-native's real on-disk location WITHOUT `require.resolve`: under
// the default (mock-engine) Vitest config the plugin intercepts `react-native/*`
// resolution even through node:module's createRequire, so we walk node_modules
// and follow the symlink with realpathSync instead.
const RN = path.dirname(fs.realpathSync(findUp("node_modules/react-native/package.json", HERE)));
// projectRoot = the dir owning package.json (where @react-native/babel-preset resolves).
const projectRoot = path.dirname(findUp("package.json", HERE));

describe("transformRN", () => {
  it("lowers RN 0.84 Flow component syntax to runnable JS", () => {
    const file = path.join(RN, "Libraries/Components/View/View.js");
    const src = fs.readFileSync(file, "utf8");
    expect(/\bcomponent\s+View\(/.test(src)).toBe(true); // source uses component syntax
    const out = transformRN(file, src, projectRoot);
    expect(out).not.toMatch(/\bcomponent\s+View\(/); // lowered
    expect(out).not.toMatch(/import typeof/);
  });

  it("returns identical output on a second (cached) call", () => {
    const file = path.join(RN, "Libraries/StyleSheet/StyleSheet.js");
    const src = fs.readFileSync(file, "utf8");
    const a = transformRN(file, src, projectRoot);
    const b = transformRN(file, src, projectRoot);
    expect(b).toBe(a);
  });

  it("invalidates the in-memory transform cache when a watched file changes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-transform-"));
    const file = path.join(dir, "module.ts");
    try {
      fs.writeFileSync(file, "export default 1;");
      const first = transformRN(file, fs.readFileSync(file, "utf8"), projectRoot);
      fs.writeFileSync(file, "export default 2;");
      const nextTime = new Date(Date.now() + 1000);
      fs.utimesSync(file, nextTime, nextTime);
      const second = transformRN(file, fs.readFileSync(file, "utf8"), projectRoot);
      expect(second).not.toBe(first);
      expect(second).toContain("2");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// @ts-expect-error — runtime .mjs
import { boundarySourceFor, isBoundary } from "../src/native/boundary.mjs";
import Module from "node:module";

function evalCjs(source: string): any {
  const filename = path.join(projectRoot, "boundary-test.js");
  const m = new Module(filename, null);
  m.filename = filename;
  // Give the virtual module real resolution paths so `require("react")` (used by
  // the host-component mocks) resolves, mirroring how RN modules compile in prod.
  // @ts-expect-error internal
  m.paths = Module._nodeModulePaths(projectRoot);
  // @ts-expect-error internal
  m._compile(source, filename);
  return m.exports;
}

describe("native boundary", () => {
  it("identifies boundary modules by suffix", () => {
    expect(isBoundary("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js")).toBe(true);
    expect(isBoundary("/x/react-native/Libraries/StyleSheet/StyleSheet.js")).toBe(false);
  });

  it("TurboModuleRegistry mock never throws and returns constants", () => {
    const src = boundarySourceFor("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js");
    const mod = evalCjs(src!);
    expect(typeof mod.getEnforcing).toBe("function");
    const dev = mod.getEnforcing("DeviceInfo");
    expect(dev.getConstants().Dimensions.window.width).toBe(390);
  });

  it("keeps NativeAppearance state coherent across reads and writes", () => {
    const src = boundarySourceFor("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js");
    const mod = evalCjs(src!);
    const appearance = mod.getEnforcing("Appearance");
    expect(appearance.getColorScheme()).toBe("light");
    appearance.setColorScheme("dark");
    expect(appearance.getColorScheme()).toBe("dark");
    appearance.setColorScheme("unspecified");
    expect(appearance.getColorScheme()).toBe("light");
  });

  it("requireNativeComponent mock returns a host component factory", () => {
    const src = boundarySourceFor(
      "/x/react-native/Libraries/ReactNative/requireNativeComponent.js",
    );
    const mod = evalCjs(src!);
    expect(typeof mod.default).toBe("function");
  });
});

// @ts-expect-error — runtime .mjs
import { resolvePlatformFile } from "../src/native/resolve.mjs";

describe("resolvePlatformFile", () => {
  it("resolves a plain .js module that exists in RN", () => {
    const base = path.join(RN, "Libraries/StyleSheet/StyleSheet");
    expect(resolvePlatformFile(base)).toBe(base + ".js");
  });

  it("returns null when nothing matches", () => {
    expect(resolvePlatformFile(path.join(RN, "Libraries/Does/Not/Exist"))).toBe(null);
  });

  it("resolves configured-platform TypeScript variants used by transform packages", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-resolve-"));
    const base = path.join(dir, "module");
    try {
      fs.writeFileSync(base + ".ios.ts", "export default 'ios';");
      fs.writeFileSync(base + ".android.tsx", "export default 'android';");
      expect(resolvePlatformFile(base, "ios")).toBe(base + ".ios.ts");
      expect(resolvePlatformFile(base, "android")).toBe(base + ".android.tsx");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// @ts-expect-error — runtime .mjs
import * as nativeLoader from "../src/native/loader.mjs";

describe("native preset redirect (ESM loader)", () => {
  it("redirects a bare preset import to a synthetic preset URL", async () => {
    await nativeLoader.initialize({
      projectRoot,
      transformPkgs: [],
      presetExports: { "react-native-reanimated": ["useSharedValue", "View"] },
    });
    const result = await nativeLoader.resolve(
      "react-native-reanimated",
      { parentURL: undefined },
      () => {
        throw new Error("nextResolve should not be called for a preset package");
      },
    );
    expect(result.shortCircuit).toBe(true);
    expect(result.url).toBe("vitest-native-preset:react-native-reanimated");
  });

  it("serves ESM source that re-exports the runtime mock from globalThis", async () => {
    const result = await nativeLoader.load(
      "vitest-native-preset:react-native-reanimated",
      {},
      () => {
        throw new Error("nextLoad should not be called for a preset URL");
      },
    );
    expect(result.format).toBe("module");
    expect(result.source).toContain("globalThis.__vitest_native_preset_mocks");
    expect(result.source).toContain('export const useSharedValue = _m["useSharedValue"];');
    expect(result.source).toContain('export const View = _m["View"];');
    // Honors a factory-provided default; falls back to the namespace object.
    expect(result.source).toContain('export default ("default" in _m ? _m["default"] : _m);');
  });

  it("passes non-preset specifiers through to the next resolver", async () => {
    const sentinel = { url: "file:///passthrough", shortCircuit: true };
    const result = await nativeLoader.resolve(
      "some-unrelated-package",
      { parentURL: undefined },
      () => sentinel,
    );
    expect(result).toBe(sentinel);
  });

  it("redirects a preset subpath import and serves a leaf-aware default", async () => {
    await nativeLoader.initialize({
      projectRoot,
      transformPkgs: [],
      presetExports: { "react-native-gesture-handler": ["Swipeable", "State"] },
      assetExts: ["png", "ttf"],
    });
    const resolved = await nativeLoader.resolve(
      "react-native-gesture-handler/Swipeable",
      { parentURL: undefined },
      () => {
        throw new Error("nextResolve should not be called for a preset subpath");
      },
    );
    expect(resolved.url).toBe("vitest-native-preset:react-native-gesture-handler/Swipeable");
    const loaded = await nativeLoader.load(resolved.url, {}, () => {
      throw new Error("nextLoad should not be called for a preset URL");
    });
    // Default = the mock export matching the leaf name, falling back to the
    // factory default / namespace.
    expect(loaded.source).toContain('const _hit = "Swipeable" in _m;');
    expect(loaded.source).toContain('export default (_hit ? _m["Swipeable"]');
    expect(loaded.source).toContain('export const State = _m["State"];');
  });

  it("passes preset package.json and asset subpaths through to the real resolver", async () => {
    // package.json falls through (and gets the JSON import attribute injected).
    const jsonResult = await nativeLoader.resolve(
      "react-native-gesture-handler/package.json",
      { parentURL: undefined },
      () => ({ url: "file:///real/package.json", shortCircuit: true }),
    );
    expect(jsonResult.url).toBe("file:///real/package.json");
    expect(jsonResult.importAttributes?.type).toBe("json");
    // Assets fall through so the real file is stubbed from disk.
    const assetSentinel = { url: "file:///real/back-icon.png", shortCircuit: true };
    const assetResult = await nativeLoader.resolve(
      "react-native-gesture-handler/assets/back-icon.png",
      { parentURL: undefined },
      () => assetSentinel,
    );
    expect(assetResult).toBe(assetSentinel);
  });
});

// @ts-expect-error — runtime .mjs
import { packageNameOf, subpathLeafOf } from "../src/native/match.mjs";

describe("specifier helpers", () => {
  it("packageNameOf handles bare, scoped, and non-package specifiers", () => {
    expect(packageNameOf("react-native-gesture-handler/Swipeable")).toBe(
      "react-native-gesture-handler",
    );
    expect(packageNameOf("@react-navigation/native/lib/commonjs/index.js")).toBe(
      "@react-navigation/native",
    );
    expect(packageNameOf("lodash")).toBe("lodash");
    expect(packageNameOf("./relative/path")).toBe(".");
    expect(packageNameOf("/abs/path")).toBe("");
  });

  it("subpathLeafOf extracts the leaf module name", () => {
    expect(subpathLeafOf("pkg/lib/Swipeable")).toBe("Swipeable");
    expect(subpathLeafOf("react-native/Libraries/Utilities/Platform.ios.js")).toBe("Platform");
    expect(subpathLeafOf("pkg/trailing/")).toBe(null);
  });
});

import { reactNative } from "../src/index.js";

const SERVE_ENV = { command: "serve", mode: "test" } as const;

describe("plugin engine routing", () => {
  it("auto (default) resolves to native when the project is native-capable", async () => {
    const plugin = reactNative({}) as any;
    const cfg = await plugin.config({ root: projectRoot }, SERVE_ENV);
    // native config: RN is externalized (loads through Node) and NOT virtualized.
    const ext = cfg.test.server.deps.external.map(String).join(",");
    expect(ext).toMatch(/react-native/);
    expect(cfg.test.setupFiles.some((p: string) => p.includes("native"))).toBe(true);
    expect(plugin.resolveId("react-native", undefined)).toBeUndefined();
  });

  it("uses Vite 8's Oxc JSX configuration", async () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    const cfg = await plugin.config({ root: projectRoot }, SERVE_ENV);
    expect(cfg.oxc).toEqual({ jsx: { runtime: "automatic" } });
    expect(cfg.esbuild).toBeUndefined();
  });

  it("uses the legacy esbuild JSX configuration for Vite 6 and 7", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-vite-7-"));
    try {
      const viteDir = path.join(tmp, "node_modules", "vite");
      fs.mkdirSync(viteDir, { recursive: true });
      fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "fixture" }));
      fs.writeFileSync(path.join(viteDir, "package.json"), JSON.stringify({ version: "7.3.2" }));
      const plugin = reactNative({ engine: "mock" }) as any;
      const cfg = await plugin.config({ root: tmp }, SERVE_ENV);
      expect(cfg.esbuild).toEqual({ jsx: "automatic" });
      expect(cfg.oxc).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("explicit native sets RN external + a native setup file, and does NOT virtualize react-native", async () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const cfg = await plugin.config({ root: projectRoot }, SERVE_ENV);
    const ext = cfg.test.server.deps.external.map(String).join(",");
    expect(ext).toMatch(/react-native/);
    expect(cfg.test.setupFiles.some((p: string) => p.includes("native"))).toBe(true);
    expect(plugin.resolveId("react-native", undefined)).toBeUndefined();
  });

  it("externalizes RN only under node_modules, not a project named react-native", async () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const cfg = await plugin.config({ root: projectRoot }, SERVE_ENV);
    const external: RegExp[] = cfg.test.server.deps.external;
    const matches = (p: string) => external.some((re) => re instanceof RegExp && re.test(p));

    // A repo literally named `react-native` (e.g. checked out at
    // /home/runner/work/react-native/react-native/ in CI): test files must NOT be
    // externalized, otherwise `.tsx` is sent raw to Node and vi.mock() stops hoisting.
    expect(matches("/home/runner/work/react-native/react-native/__tests__/foo.test.tsx")).toBe(
      false,
    );
    // Real RN (and @react-native/* scoped packages), including pnpm-nested layouts,
    // must still be externalized.
    expect(matches("/proj/node_modules/react-native/index.js")).toBe(true);
    expect(matches("/proj/node_modules/@react-native/assets-registry/registry.js")).toBe(true);
    expect(
      matches("/proj/node_modules/.pnpm/react-native@0.81.0/node_modules/react-native/index.js"),
    ).toBe(true);
  });

  it("rejects mock-only top-level overrides when native is selected", async () => {
    const plugin = reactNative({
      engine: "native",
      mocks: { AuditOverride: "configured" },
    }) as any;
    await expect(plugin.config({ root: projectRoot }, SERVE_ENV)).rejects.toThrow(
      /only supported by engine:'mock'/,
    );
  });

  it("native + hotRuntime wires the custom pool and isolate:false scheduling", async () => {
    const plugin = reactNative({ engine: "native", hotRuntime: true }) as any;
    const cfg = await plugin.config({ root: projectRoot }, SERVE_ENV);
    // Scheduling: isolate:false keeps workers alive; the worker entry flips
    // isolate back on inside the worker (see src/native/worker.mjs).
    expect(cfg.test.isolate).toBe(false);
    expect(cfg.test.pool).toMatchObject({ name: "vitest-native" });
    expect(typeof cfg.test.pool.createPoolWorker).toBe("function");
    // The pool worker boots our hot entry, not Vitest's stock workers/threads.js.
    const worker = cfg.test.pool.createPoolWorker({
      distPath: "/tmp/unused",
      project: {
        vitest: { logger: { outputStream: process.stdout, errorStream: process.stderr } },
      },
      method: "run",
      environment: { name: "node", options: null },
      execArgv: [],
      env: {},
    });
    expect(worker.name).toBe("vitest-native");
    expect((worker as any).entrypoint).toMatch(/native[\\/]worker\.mjs$/);
    // Plain `hotRuntime: true` (no explicit recycling) applies the default
    // per-worker memory bound, which turns on heap reporting. Guards the
    // plugin.ts default-application wiring, not just defaultHotMemoryLimit().
    expect(worker.reportMemory).toBe(true);
  });

  it("hotRuntime object form wires recycling policy into the pool worker", async () => {
    const plugin = reactNative({
      engine: "native",
      hotRuntime: { recycleAfterFiles: 2, memoryLimit: 1024 },
    }) as any;
    const cfg = await plugin.config({ root: projectRoot }, SERVE_ENV);
    expect(cfg.test.runner).toMatch(/native[\\/]runner\.mjs$/);
    const worker = cfg.test.pool.createPoolWorker({
      distPath: "/tmp/unused",
      project: {
        vitest: { logger: { outputStream: process.stdout, errorStream: process.stderr } },
      },
      method: "run",
      environment: { name: "node", options: null },
      execArgv: [],
      env: {},
    });
    // memoryLimit > 0 turns on worker heap reporting.
    expect(worker.reportMemory).toBe(true);
    const task = { context: { environment: { name: "node", options: null } } };
    expect(worker.canReuse(task)).toBe(true);
    // Two files through send() hit recycleAfterFiles=2 → worker retires.
    // (send throws without a live thread; the file count is recorded first.)
    for (const _ of [1, 2]) {
      try {
        worker.send({ type: "run", context: { files: ["a.test.ts"] } });
      } catch {}
    }
    expect(worker.canReuse(task)).toBe(false);
  });

  it("hotRuntime without native engine warns and keeps the mock config", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = reactNative({ engine: "mock", hotRuntime: true }) as any;
    const cfg = await plugin.config({ root: projectRoot }, SERVE_ENV);
    expect(cfg.test.pool).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("hotRuntime"))).toBe(true);
    warn.mockRestore();
  });

  it("explicit mock virtualizes react-native", async () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    await plugin.config({ root: projectRoot }, SERVE_ENV);
    expect(plugin.resolveId("react-native", undefined)).toBe("\0virtual:react-native");
  });
});

describe("engine-selection notices", () => {
  it("auto stays silent when it selects native (the happy path)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const plugin = reactNative({}) as any;
    await plugin.config({ root: projectRoot }, SERVE_ENV);
    const notices = log.mock.calls.filter((c) => String(c[0]).includes("[vitest-native]"));
    expect(notices).toHaveLength(0);
    log.mockRestore();
  });

  it("auto explains the mock fallback once when native deps are absent", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-nudge-"));
    try {
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        JSON.stringify({ name: "x", version: "0.0.0" }),
      );
      const plugin = reactNative({}) as any;
      await plugin.config({ root: tmp }, SERVE_ENV);
      const notices = log.mock.calls.filter((c) =>
        String(c[0]).includes("@react-native/babel-preset not found"),
      );
      expect(notices).toHaveLength(1);
    } finally {
      log.mockRestore();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// @ts-expect-error — runtime .mjs
import { installGlobals } from "../src/native/globals.mjs";

describe("native globals: globalThis.expo shim", () => {
  it("installs a functional EventEmitter + NativeModule/SharedObject + helpers", () => {
    installGlobals();
    const expo = (globalThis as { expo?: any }).expo;
    expect(typeof expo.EventEmitter).toBe("function");

    const ee = new expo.EventEmitter();
    let received: unknown;
    const sub = ee.addListener("evt", (v: unknown) => {
      received = v;
    });
    ee.emit("evt", 42);
    expect(received).toBe(42);
    sub.remove();
    ee.emit("evt", 99);
    expect(received).toBe(42); // listener removed

    // NativeModule/SharedObject/SharedRef extend EventEmitter in expo's runtime.
    expect(new expo.NativeModule()).toBeInstanceOf(expo.EventEmitter);
    expect(new expo.SharedRef()).toBeInstanceOf(expo.SharedObject);

    expect(expo.modules).toEqual({});
    expect(typeof expo.uuidv4()).toBe("string");
    expect(expo.getViewConfig()).toBeNull();
  });
});

import { defaultHotMemoryLimit } from "../src/native/pool.js";

describe("defaultHotMemoryLimit", () => {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  it("scales with total memory at 25% between the bounds", () => {
    // 0.25 * 16 GB = 4 GB → clamped to the 1.5 GB ceiling; pick a total whose
    // quarter lands inside the band: 0.25 * 4 GB = 1 GB.
    expect(defaultHotMemoryLimit(4 * GB)).toBe(1 * GB);
    expect(defaultHotMemoryLimit(5 * GB)).toBe(Math.floor(0.25 * 5 * GB));
  });

  it("clamps up to the 768 MB floor on small machines", () => {
    // 0.25 * 2 GB = 512 MB, below the floor.
    expect(defaultHotMemoryLimit(2 * GB)).toBe(768 * MB);
    expect(defaultHotMemoryLimit(0)).toBe(768 * MB);
  });

  it("clamps down to the 1.5 GB ceiling on large machines", () => {
    expect(defaultHotMemoryLimit(64 * GB)).toBe(1536 * MB);
    expect(defaultHotMemoryLimit(8 * GB)).toBe(1536 * MB); // 0.25 * 8 GB = 2 GB
  });

  it("defaults totalmem from os when no argument is given", () => {
    const limit = defaultHotMemoryLimit();
    expect(limit).toBeGreaterThanOrEqual(768 * MB);
    expect(limit).toBeLessThanOrEqual(1536 * MB);
  });
});

import { gestureHandler } from "../src/presets/index.js";

describe("plugin subpath resolution (mock engine)", () => {
  async function makePlugin() {
    const plugin = reactNative({ engine: "mock", presets: [gestureHandler()] }) as any;
    await plugin.config({ root: projectRoot }, SERVE_ENV);
    await plugin.configResolved({ root: projectRoot });
    return plugin;
  }

  it("redirects preset subpaths to a leaf-aware virtual module", async () => {
    const plugin = await makePlugin();
    const id = plugin.resolveId("react-native-gesture-handler/Swipeable", undefined);
    expect(id).toBe("\0virtual:preset:react-native-gesture-handler/Swipeable");
    const code = plugin.load(id);
    expect(code).toContain('const _hit = "Swipeable" in _m;');
    expect(code).toContain('export default (_hit ? _m["Swipeable"]');
    // Named exports still come from the root preset mock.
    expect(code).toContain("export const State = _m['State'];");
  });

  it("does not redirect preset package.json or asset subpaths", async () => {
    const plugin = await makePlugin();
    expect(plugin.resolveId("react-native-gesture-handler/package.json", undefined)).toBe(
      undefined,
    );
    expect(plugin.resolveId("react-native-gesture-handler/assets/icon.png", undefined)).toBe(
      undefined,
    );
  });

  it("resolves react-native/package.json to the real on-disk manifest", async () => {
    const plugin = await makePlugin();
    const resolvedPath = plugin.resolveId("react-native/package.json", undefined);
    expect(typeof resolvedPath).toBe("string");
    expect(resolvedPath).toMatch(/package\.json$/);
    expect(fs.existsSync(resolvedPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(resolvedPath, "utf8")).name).toBe("react-native");
  });

  it("serves rn-subpath virtuals with the leaf export as default", async () => {
    const plugin = await makePlugin();
    const id = plugin.resolveId("react-native/Libraries/Utilities/Platform", undefined);
    expect(id).toBe("\0virtual:rn-subpath:react-native/Libraries/Utilities/Platform");
    expect(plugin.load(id)).toContain('export default _rn["Platform"];');
    // Unknown leaves keep the whole-mock default.
    const unknownId = plugin.resolveId("react-native/jest-preset", undefined);
    expect(plugin.load(unknownId)).toContain("export default _rn;");
  });
});
