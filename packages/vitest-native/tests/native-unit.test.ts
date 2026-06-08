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
    expect(result.source).toContain("export default _m;");
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
});

import { reactNative } from "../src/index.js";

const SERVE_ENV = { command: "serve", mode: "test" } as const;

describe("plugin engine routing", () => {
  it("auto (default) resolves to mock today, even when native is available", () => {
    const plugin = reactNative({}) as any;
    const cfg = plugin.config({ root: projectRoot }, SERVE_ENV);
    // mock config: no RN externalization, react-native is virtualized.
    expect(cfg.test.server?.deps?.external).toBeUndefined();
    expect(plugin.resolveId("react-native", undefined)).toBe("\0virtual:react-native");
  });

  it("explicit native sets RN external + a native setup file, and does NOT virtualize react-native", () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const cfg = plugin.config({ root: projectRoot }, SERVE_ENV);
    const ext = cfg.test.server.deps.external.map(String).join(",");
    expect(ext).toMatch(/react-native/);
    expect(cfg.test.setupFiles.some((p: string) => p.includes("native"))).toBe(true);
    expect(plugin.resolveId("react-native", undefined)).toBeUndefined();
  });

  it("explicit mock virtualizes react-native", () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    plugin.config({ root: projectRoot }, SERVE_ENV);
    expect(plugin.resolveId("react-native", undefined)).toBe("\0virtual:react-native");
  });
});

describe("native nudge", () => {
  it("auto prints the native nudge once when the project is native-capable", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const plugin = reactNative({}) as any;
    plugin.config({ root: projectRoot }, SERVE_ENV);
    const nudges = log.mock.calls.filter((c) => String(c[0]).includes("native engine available"));
    expect(nudges).toHaveLength(1);
    log.mockRestore();
  });

  it("auto prints no nudge when native deps are absent", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-nudge-"));
    try {
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        JSON.stringify({ name: "x", version: "0.0.0" }),
      );
      const plugin = reactNative({}) as any;
      plugin.config({ root: tmp }, SERVE_ENV);
      const nudges = log.mock.calls.filter((c) => String(c[0]).includes("native engine available"));
      expect(nudges).toHaveLength(0);
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
