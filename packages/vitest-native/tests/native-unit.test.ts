import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
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

import { reactNative } from "../src/index.js";

describe("plugin engine routing", () => {
  it("native engine sets RN external + a native setup file, and does NOT virtualize react-native", () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const cfg = plugin.config({}, { command: "serve", mode: "test" });
    const ext = cfg.test.server.deps.external.map(String).join(",");
    expect(ext).toMatch(/react-native/);
    expect(cfg.test.setupFiles.some((p: string) => p.includes("native"))).toBe(true);
    // Under native, react-native must NOT be redirected to the mock virtual module.
    expect(plugin.resolveId("react-native", undefined)).toBeUndefined();
  });

  it("mock engine still virtualizes react-native", () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    expect(plugin.resolveId("react-native", undefined)).toBe("\0virtual:react-native");
  });
});
