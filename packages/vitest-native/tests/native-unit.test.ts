import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
// @ts-expect-error — runtime .mjs, no types
import { transformRN } from "../src/native/transform.mjs";
import { parseDeprecatedReactNativeExports, parseReactNativeExports } from "../src/plugin.js";
import { PEER_REQUIREMENTS } from "../src/peer-requirements.js";
import { validatePeerDependency } from "../src/validate.js";
import { nativePool } from "../src/native/pool.js";
import { createRequire } from "node:module";
import { runPluginConfig } from "./plugin-config.js";

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

  it("stubs expo's dev-server messageSocket (all published variants) to a no-op", () => {
    // The real module throws at load time under Node ("Cannot create devtools
    // websocket connections in embedded environments") whenever __DEV__ &&
    // globalThis.expo — the wall that blocked every expo-* import in Expo apps.
    for (const p of [
      "/x/node_modules/expo/src/async-require/messageSocket.native.ts",
      "/x/node_modules/expo/src/async-require/messageSocket.ts",
      "/x/node_modules/expo/build/async-require/messageSocket.native.js",
      "/x/node_modules/expo/build/async-require/messageSocket.js",
    ]) {
      expect(isBoundary(p)).toBe(true);
      const mod = evalCjs(boundarySourceFor(p)!);
      expect(mod).toEqual({});
    }
    // Other expo modules stay untouched.
    expect(isBoundary("/x/node_modules/expo/src/Expo.fx.tsx")).toBe(false);
    expect(boundarySourceFor("/x/node_modules/expo/src/async-require/index.ts")).toBe(null);
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

  it("turboStubs are identity-stable and spy-able", () => {
    const src = boundarySourceFor("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js");
    const mod = evalCjs(src!);
    const stub = mod.getEnforcing("IdentityTarget");
    // Repeated module and method reads return the same objects — a prerequisite
    // for vi.spyOn and instanceof-style assertions in migrated Jest suites.
    expect(mod.getEnforcing("IdentityTarget")).toBe(stub);
    expect(stub.someMethod).toBe(stub.someMethod);
    const spy = vi.spyOn(stub, "someMethod");
    stub.someMethod("a", 1);
    expect(spy).toHaveBeenCalledWith("a", 1);
    spy.mockRestore();
    // Restored method keeps the generic stub behavior.
    expect(stub.someMethod()).toBeUndefined();
  });

  it("NativeModules and TurboModuleRegistry share stub identity", () => {
    const tm = evalCjs(
      boundarySourceFor("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js")!,
    );
    const nm = evalCjs(
      boundarySourceFor("/x/react-native/Libraries/BatchedBridge/NativeModules.js")!,
    ).default;
    // DeviceInfo is a module the boundary serves constants for, so it exists.
    expect(nm.DeviceInfo).toBe(tm.get("DeviceInfo"));
    expect(nm.DeviceInfo).toBe(tm.getEnforcing("DeviceInfo"));
  });

  it("the hot-reset registry clears overrides but keeps stub identity", () => {
    const src = boundarySourceFor("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js");
    const mod = evalCjs(src!);
    const stub = mod.getEnforcing("ResetTarget");
    stub.overridden = "test-phase value";
    const resets = (globalThis as any).__vitest_native_resets;
    expect(Array.isArray(resets)).toBe(true);
    for (const fn of resets) fn();
    // Same stub object survives (resident libs hold references), but the
    // per-file override is gone — the slot regenerates as a generic stub
    // method like any other unknown property.
    expect(mod.getEnforcing("ResetTarget")).toBe(stub);
    expect(stub.overridden).not.toBe("test-phase value");
    expect(typeof stub.overridden).toBe("function");
    expect(typeof stub.someMethod).toBe("function");
  });
});

import {
  BOUNDARY_NATIVE_MODULES,
  installKnownNativeModules,
  knownNativeModulesFor,
  nativeModuleSpecsFor,
  scanReactNativeModuleRequests,
} from "../src/native/native-modules.mjs";

describe("native boundary: which native modules exist", () => {
  const g = globalThis as Record<string, any>;
  const load = () => ({
    tm: evalCjs(boundarySourceFor("/x/react-native/Libraries/TurboModule/TurboModuleRegistry.js")!),
    nm: evalCjs(boundarySourceFor("/x/react-native/Libraries/BatchedBridge/NativeModules.js")!)
      .default,
  });
  let savedKnown: unknown;
  let savedMocks: unknown;
  let savedSpecs: unknown;
  beforeEach(() => {
    savedKnown = g.__vitest_native_known_modules;
    savedMocks = g.__vitest_native_module_mocks;
    savedSpecs = g.__vitest_native_module_specs;
    g.__vitest_native_known_modules = new Set(["Appearance", "SpecKeyboardObserver"]);
    g.__vitest_native_module_mocks = Object.create(null);
    g.__vitest_native_module_specs = new Map([
      ["SpecKeyboardObserver", new Set(["addListener", "removeListeners"])],
      ["PlatformConstants", new Set(["getAndroidID"])],
    ]);
    return () => {
      g.__vitest_native_known_modules = savedKnown;
      g.__vitest_native_module_mocks = savedMocks;
      g.__vitest_native_module_specs = savedSpecs;
    };
  });

  it("a module with a known spec has exactly its spec's members, as on a device", async () => {
    const { tm } = load();
    const observer = tm.get("SpecKeyboardObserver");
    expect(typeof observer.addListener).toBe("function");
    expect("removeListeners" in observer).toBe(true);
    expect(observer.captureRejections).toBeUndefined();
    expect(observer.then).toBeUndefined();
    expect("then" in observer).toBe(false);
    // React Native's Keyboard hands this object to a NativeEventEmitter; a test that
    // mocks that emitter with Node's EventEmitter passes it as EventEmitter options.
    const { EventEmitter } = await import("node:events");
    expect(() => new EventEmitter(observer)).not.toThrow();
    const spy = vi.spyOn(observer, "addListener");
    observer.addListener("keyboardDidShow");
    expect(spy).toHaveBeenCalledWith("keyboardDidShow");
    spy.mockRestore();
  });

  it("a module with boundary constants keeps getConstants beside its spec", () => {
    const { tm } = load();
    const constants = tm.get("PlatformConstants");
    expect(constants.getConstants().isTesting).toBe(true);
    expect(typeof constants.getAndroidID).toBe("function");
    expect(constants.forceTouchAvailable).toBeUndefined();
  });

  it("nativeModules: 'permissive' makes every name present with every member", () => {
    vi.stubEnv("VITEST_NATIVE_NATIVE_MODULES", "permissive");
    try {
      const { tm, nm } = load();
      expect(typeof nm.EXDevLauncher.anything).toBe("function");
      expect("EXDevLauncher" in nm).toBe(true);
      expect(tm.get("EXDevLauncher")).toBe(nm.EXDevLauncher);
      expect(typeof tm.get("SpecKeyboardObserver").captureRejections).toBe("function");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a module without a known spec answers every name", () => {
    const { tm } = load();
    expect(typeof tm.get("Appearance").anything).toBe("function");
  });

  it("an unregistered module is null from get() and undefined from NativeModules", () => {
    const { tm, nm } = load();
    expect(tm.get("EXDevLauncher")).toBeNull();
    expect(nm.EXDevLauncher).toBeUndefined();
    expect("EXDevLauncher" in nm).toBe(false);
  });

  it("getEnforcing() still returns a stub for an unregistered module", () => {
    const { tm, nm } = load();
    const required = tm.getEnforcing("EXDevLauncher");
    expect(typeof required.anything).toBe("function");
    // Requiring a module does not make it visible to optional lookups.
    expect(nm.EXDevLauncher).toBeUndefined();
  });

  it("a known module is present for every lookup kind", () => {
    const { tm, nm } = load();
    expect(nm.Appearance).toBeDefined();
    expect("Appearance" in nm).toBe(true);
    expect(tm.get("Appearance")).toBe(nm.Appearance);
    expect(tm.getEnforcing("Appearance")).toBe(nm.Appearance);
  });

  it("a module with boundary constants is present without being in the set", () => {
    g.__vitest_native_known_modules = new Set();
    const { tm, nm } = load();
    expect(tm.get("PlatformConstants").getConstants().isTesting).toBe(true);
    expect(nm.SourceCode.getConstants().scriptURL).toBe("file:///index.bundle");
  });

  it("a mocked module is present on both paths", () => {
    const { tm, nm } = load();
    const impl = { manifestString: "{}" };
    g.__vitest_native_module_mocks.EXDevLauncher = impl;
    expect(nm.EXDevLauncher).toBe(impl);
    expect("EXDevLauncher" in nm).toBe(true);
    expect(tm.get("EXDevLauncher")).toBe(impl);
    delete g.__vitest_native_module_mocks.EXDevLauncher;
    expect(nm.EXDevLauncher).toBeUndefined();
  });

  it("installKnownNativeModules reads the plugin's list, or computes it", () => {
    g.__vitest_native_known_modules = undefined;
    vi.stubEnv("VITEST_NATIVE_RN_NATIVE_MODULES", JSON.stringify(["FromEnv"]));
    try {
      installKnownNativeModules(projectRoot);
      expect([...g.__vitest_native_known_modules]).toEqual(["FromEnv"]);
      g.__vitest_native_known_modules = undefined;
      vi.stubEnv("VITEST_NATIVE_RN_NATIVE_MODULES", "");
      installKnownNativeModules(projectRoot);
      expect([...g.__vitest_native_known_modules]).toEqual(knownNativeModulesFor(projectRoot));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("scanReactNativeModuleRequests", () => {
  it("reads lookups from React Native's sources, not its comments or tests", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-rn-scan-"));
    try {
      const write = (rel: string, body: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), body);
      };
      write(
        "Libraries/Foo/NativeFoo.js",
        "export interface Spec extends TurboModule {\n" +
          "  +getConstants: () => {|\n    +nested: string,\n  |};\n" +
          "  +show: (\n    options: {| title?: string |},\n    callback: (index: number) => void,\n  ) => void;\n" +
          "  +optional?: () => Promise<{| value: number |}>;\n" +
          "  readonly current: () => void;\n" +
          "  readonly: () => void;\n" +
          "}\n" +
          "export default TurboModuleRegistry.get<Spec>('Foo');\n" +
          "const B = TurboModuleRegistry.getEnforcing<Spec>(\n  'BarCxx',\n);\n" +
          "// TurboModuleRegistry.get('Commented')\n/* NativeModules.Documented */\n",
      );
      write("src/private/Baz.js", "const z = NativeModules.Baz; const q = NativeModules['Qux'];");
      write("src/private/Dyn.js", "TurboModuleRegistry.get(name);");
      write("Libraries/Foo/__tests__/Foo-test.js", "TurboModuleRegistry.get('TestOnly');");
      write("Libraries/Foo/Foo.d.ts", "NativeModules.TypesOnly;");
      expect(scanReactNativeModuleRequests(root)).toEqual({
        files: 3,
        get: ["Foo"],
        getEnforcing: ["BarCxx"],
        nativeModules: ["Baz", "Qux"],
        // Only the interface's own members; names inside parameter and object types
        // are not.
        specs: {
          Foo: ["current", "getConstants", "optional", "readonly", "show"],
          BarCxx: ["current", "getConstants", "optional", "readonly", "show"],
        },
        unnamed: 1,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("the known set is the installed React Native's requests plus the boundary's own", () => {
    const known = knownNativeModulesFor(projectRoot);
    for (const name of BOUNDARY_NATIVE_MODULES) expect(known).toContain(name);
    // Core modules React Native's JS requests on every version this package supports.
    for (const name of ["Appearance", "DeviceInfo", "PlatformConstants", "UIManager"]) {
      expect(known).toContain(name);
    }
    expect(known).not.toContain("EXDevLauncher");
  });
});

import { extensionsFor, resolvePlatformFile } from "../src/native/resolve.mjs";
import { getConfiguredPlatformExtensions, getPlatformExtensions } from "../src/resolve.js";

describe("platform extension order", () => {
  // Metro's defaults, from metro-config/src/defaults/defaults.js:
  //   sourceExts = ["js", "jsx", "json", "ts", "tsx"]
  // and metro-resolver's resolveSourceFile loops those in the OUTER loop, trying
  // platform, .native, and bare variants inside each round — extension-major.
  //
  // An earlier version of this test asserted the platform-major interleaving AS
  // Metro's order: the implementation's own mistake, written into the gate that
  // existed to catch it. These literals are therefore no longer the authority —
  // tests/metro-resolver-oracle.test.ts checks the resolver against a real pinned
  // metro-resolver, so a wrong belief here fails there.
  it("matches Metro's sourceExts, in Metro's order (extension-major)", () => {
    expect(extensionsFor("ios")).toEqual([
      ".ios.js",
      ".native.js",
      ".js",
      ".ios.jsx",
      ".native.jsx",
      ".jsx",
      ".ios.json",
      ".native.json",
      ".json",
      ".ios.ts",
      ".native.ts",
      ".ts",
      ".ios.tsx",
      ".native.tsx",
      ".tsx",
    ]);
    expect(extensionsFor("android").slice(0, 3)).toEqual([".android.js", ".native.js", ".js"]);
  });

  // The mixed-variant shapes where the two interleavings genuinely disagree —
  // each of these resolved to the WRONG file before the ordering fix.
  it("resolves mixed platform/extension variants exactly as Metro does", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-resolve-order-"));
    try {
      // .native.js beats .ios.tsx: the js round completes before tsx is tried.
      const a = path.join(dir, "a");
      fs.writeFileSync(a + ".native.js", "");
      fs.writeFileSync(a + ".ios.tsx", "");
      expect(resolvePlatformFile(a, "ios")).toBe(a + ".native.js");
      // Bare .js beats .native.tsx for the same reason.
      const b = path.join(dir, "b");
      fs.writeFileSync(b + ".js", "");
      fs.writeFileSync(b + ".native.tsx", "");
      expect(resolvePlatformFile(b, "ios")).toBe(b + ".js");
      // Within one extension round, platform still beats .native beats bare.
      const c = path.join(dir, "c");
      fs.writeFileSync(c + ".android.js", "");
      fs.writeFileSync(c + ".native.js", "");
      fs.writeFileSync(c + ".js", "");
      expect(resolvePlatformFile(c, "android")).toBe(c + ".android.js");
      // A platform variant in a LATER extension round loses to an earlier round's
      // .native — the shape most likely to ship a different file than the app.
      const d = path.join(dir, "d");
      fs.writeFileSync(d + ".android.tsx", "");
      fs.writeFileSync(d + ".native.jsx", "");
      expect(resolvePlatformFile(d, "android")).toBe(d + ".native.jsx");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gives the Vite graph and the Node graph the same list", () => {
    // These were two hand-written arrays with nothing holding them together. A
    // divergence would resolve one file in the Vite graph and a different one in
    // Node's, for the same import.
    for (const platform of ["ios", "android"] as const) {
      expect(getPlatformExtensions(platform)).toEqual(extensionsFor(platform));
    }
  });

  it("uses a project Metro profile as one shared, ordered candidate list", () => {
    const expoSourceExts = ["ts", "tsx", "mjs", "js", "jsx", "json", "cjs"];
    expect(getConfiguredPlatformExtensions("ios", expoSourceExts)).toEqual(
      extensionsFor("ios", expoSourceExts),
    );
    expect(extensionsFor("ios", expoSourceExts).slice(0, 9)).toEqual([
      ".ios.ts",
      ".native.ts",
      ".ts",
      ".ios.tsx",
      ".native.tsx",
      ".tsx",
      ".ios.mjs",
      ".native.mjs",
      ".mjs",
    ]);
  });
});

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

  it("prefers .js over .tsx, and resolves .json, as Metro does", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-resolve-"));
    try {
      const both = path.join(dir, "both");
      fs.writeFileSync(both + ".tsx", "export default 'tsx';");
      fs.writeFileSync(both + ".js", "export default 'js';");
      expect(resolvePlatformFile(both, "ios")).toBe(both + ".js");

      const data = path.join(dir, "data");
      fs.writeFileSync(data + ".json", "{}");
      expect(resolvePlatformFile(data, "ios")).toBe(data + ".json");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not reuse a cached answer across different project sourceExts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-resolve-profile-"));
    const base = path.join(dir, "profiled");
    try {
      fs.writeFileSync(base + ".js", "export default 'js';");
      fs.writeFileSync(base + ".tsx", "export default 'tsx';");
      expect(resolvePlatformFile(base, "ios", ["js", "tsx"])).toBe(base + ".js");
      expect(resolvePlatformFile(base, "ios", ["tsx", "js"])).toBe(base + ".tsx");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// @ts-expect-error — runtime .mjs
import * as nativeLoader from "../src/native/loader.mjs";

describe("in-thread loader hooks: where Node's are reliable", () => {
  it.each([
    ["22.13.0", false],
    ["22.19.0", false],
    ["22.22.2", false],
    ["22.22.3", true],
    ["22.23.0", true],
    ["23.11.0", false],
    ["24.11.0", false],
    ["24.12.0", true],
    ["v24.13.0", true],
    ["25.2.0", false],
    ["26.0.0", true],
  ])("%s → %s", (version, expected) => {
    expect(nativeLoader.inThreadHooksReliable(version)).toBe(expected);
  });
});

describe("in-thread loader hooks: require or import", () => {
  // The contexts Node passes module.registerHooks, as measured on each version.
  const requireOn22_19 = { conditions: ["require", "node", "node-addons", "module-sync"] };
  const requireOn22_15 = { conditions: {} }; // 22.15–22.18 and 24.0–24.4
  const importAnywhere = { conditions: ["node", "import", "module-sync", "node-addons"] };

  it("reads a require on every Node with registerHooks", () => {
    expect(nativeLoader.isRequireContext(requireOn22_19)).toBe(true);
    expect(nativeLoader.isRequireContext(requireOn22_15)).toBe(true);
    expect(nativeLoader.isRequireContext({})).toBe(true);
  });

  it("reads an import as an import", () => {
    expect(nativeLoader.isRequireContext(importAnywhere)).toBe(false);
  });
});

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

  it("passes Node-safe utility subpaths through to the real resolver", async () => {
    // Both packages registered as presets — the passthrough below must be
    // attributable to the utility-leaf exemption, not a missing registration.
    await nativeLoader.initialize({
      projectRoot,
      transformPkgs: [],
      presetExports: {
        "react-native-gesture-handler": ["Swipeable", "State"],
        "react-native-reanimated": ["useSharedValue"],
      },
      assetExts: ["png", "ttf"],
    });
    // jest-utils / jestSetup / mock / plugin are deliberately Node-safe deep
    // entries (test utilities, babel plugins) — shadowing them would replace
    // working code with undefined exports.
    for (const specifier of [
      "react-native-gesture-handler/jest-utils",
      "react-native-gesture-handler/jestSetup",
      "react-native-reanimated/mock",
      "react-native-reanimated/plugin",
    ]) {
      const sentinel = { url: `file:///real/${specifier.split("/").pop()}.js`, shortCircuit: true };
      const result = await nativeLoader.resolve(
        specifier,
        { parentURL: undefined },
        () => sentinel,
      );
      expect(result).toBe(sentinel);
    }
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
    const cfg = await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
    // native config: RN is externalized (loads through Node) and NOT virtualized.
    const ext = cfg.test.server.deps.external.map(String).join(",");
    expect(ext).toMatch(/react-native/);
    expect(cfg.test.setupFiles.some((p: string) => p.includes("native"))).toBe(true);
    expect(plugin.resolveId("react-native", undefined)).toBeUndefined();
  });

  it("uses Vite 8's Oxc JSX configuration", async () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    const cfg = await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
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
      const cfg = await runPluginConfig(plugin, { root: tmp }, SERVE_ENV);
      expect(cfg.esbuild).toEqual({ jsx: "automatic" });
      expect(cfg.oxc).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("explicit native sets RN external + a native setup file, and does NOT virtualize react-native", async () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const cfg = await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
    const ext = cfg.test.server.deps.external.map(String).join(",");
    expect(ext).toMatch(/react-native/);
    expect(cfg.test.setupFiles.some((p: string) => p.includes("native"))).toBe(true);
    expect(plugin.resolveId("react-native", undefined)).toBeUndefined();
  });

  it("passes the installed React Native's native modules to native workers only", async () => {
    const native = await runPluginConfig(
      reactNative({ engine: "native" }) as any,
      { root: projectRoot },
      SERVE_ENV,
    );
    expect(JSON.parse(native.test.env.VITEST_NATIVE_RN_NATIVE_MODULES)).toEqual(
      knownNativeModulesFor(projectRoot),
    );
    const mock = await runPluginConfig(
      reactNative({ engine: "mock" }) as any,
      { root: projectRoot },
      SERVE_ENV,
    );
    expect(mock.test.env?.VITEST_NATIVE_RN_NATIVE_MODULES).toBeUndefined();
    expect(JSON.parse(native.test.env.VITEST_NATIVE_RN_NATIVE_MODULE_SPECS)).toEqual(
      nativeModuleSpecsFor(projectRoot),
    );
    expect(native.test.env.VITEST_NATIVE_NATIVE_MODULES).toBeUndefined();
    const permissive = await runPluginConfig(
      reactNative({ engine: "native", nativeModules: "permissive" }) as any,
      { root: projectRoot },
      SERVE_ENV,
    );
    expect(permissive.test.env.VITEST_NATIVE_NATIVE_MODULES).toBe("permissive");
  });

  it("externalizes RN only under node_modules, not a project named react-native", async () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const cfg = await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
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
    await expect(runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV)).rejects.toThrow(
      /only supported by engine:'mock'/,
    );
  });

  it("native + hotRuntime wires the custom pool and isolate:false scheduling", async () => {
    const plugin = reactNative({ engine: "native", hotRuntime: true }) as any;
    const cfg = await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
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
    // cgroup-aware heap bound, which turns on heap reporting, and caps automatic
    // concurrency at the measured four-worker ceiling.
    expect(worker.reportMemory).toBe(true);
    expect(cfg.test.maxWorkers).toBeGreaterThanOrEqual(2);
    expect(cfg.test.maxWorkers).toBeLessThanOrEqual(4);
    expect(JSON.parse(cfg.test.env.VITEST_NATIVE_MEMORY_PLAN)).toMatchObject({
      version: 1,
      enforced: true,
      maxWorkers: cfg.test.maxWorkers,
    });
  });

  it("hotRuntime:'auto' selects bounded hot only for a safe stock-pool config", async () => {
    const enabled = reactNative({ engine: "native", hotRuntime: "auto" }) as any;
    expect(enabled.config).toMatchObject({ order: "post" });
    const hotConfig = await runPluginConfig(enabled, { root: projectRoot }, SERVE_ENV);
    expect(hotConfig.test.isolate).toBe(false);
    expect(hotConfig.test.pool).toMatchObject({ name: "vitest-native" });
    expect(JSON.parse(hotConfig.test.env.VITEST_NATIVE_MEMORY_PLAN)).toMatchObject({
      enforced: true,
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const declineCases = [
      {
        label: "one unrecyclable worker",
        config: { root: projectRoot, test: { fileParallelism: false, maxWorkers: 1 } },
        reason: /one unrecyclable worker/,
        pool: "threads",
      },
      {
        label: "explicit isolate: true",
        config: { root: projectRoot, test: { maxWorkers: 2, isolate: true } },
        reason: /test\.isolate is explicitly true/,
        pool: "threads",
      },
      {
        label: "explicit isolate: false",
        config: { root: projectRoot, test: { maxWorkers: 2, isolate: false } },
        reason: /test\.isolate is explicitly false/,
        pool: "threads",
      },
      {
        label: "explicit forks pool",
        config: { root: projectRoot, test: { maxWorkers: 2, pool: "forks" } },
        reason: /'forks' is explicitly configured/,
        pool: "forks",
      },
    ];

    for (const decline of declineCases) {
      warn.mockClear();
      const plugin = reactNative({ engine: "native", hotRuntime: "auto" }) as any;
      const config = await runPluginConfig(plugin, decline.config, SERVE_ENV);
      expect(config.test.isolate, decline.label).toBeUndefined();
      expect(config.test.pool, decline.label).toBe(decline.pool);
      expect(config.test.env.VITEST_NATIVE_MEMORY_PLAN, decline.label).toBeUndefined();
      expect(warn, decline.label).toHaveBeenCalledWith(expect.stringMatching(decline.reason));
    }
    warn.mockRestore();

    // Suites migrated from Jest are admitted: the jest-compat surface has its own
    // cross-file isolation gate under hot (tests-native/hot-jest-compat).
    for (const [label, config] of [
      [
        "Jest mock transform",
        {
          root: projectRoot,
          plugins: [{ name: "vitest-native:jest-mock-hoist" }],
          test: { maxWorkers: 2 },
        },
      ],
      [
        "Jest compatibility setup",
        {
          root: projectRoot,
          test: { maxWorkers: 2, setupFiles: ["vitest-native/jest-compat/setup"] },
        },
      ],
    ] as const) {
      const plugin = reactNative({ engine: "native", hotRuntime: "auto" }) as any;
      const admitted = await runPluginConfig(plugin, config, SERVE_ENV);
      expect(admitted.test.isolate, label).toBe(false);
      expect(admitted.test.pool, label).toMatchObject({ name: "vitest-native" });
    }
  });

  it("defaults to hotRuntime:'auto' and falls back quietly", async () => {
    const byDefault = reactNative({ engine: "native" }) as any;
    const hot = await runPluginConfig(byDefault, { root: projectRoot }, SERVE_ENV);
    expect(hot.test.isolate).toBe(false);
    expect(hot.test.pool).toMatchObject({ name: "vitest-native" });

    // A decline the user did not ask about is not worth a warning on every run.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const quiet = reactNative({ engine: "native" }) as any;
    const stock = await runPluginConfig(
      quiet,
      { root: projectRoot, test: { maxWorkers: 2, pool: "forks" } },
      SERVE_ENV,
    );
    expect(stock.test.isolate).toBeUndefined();
    expect(stock.test.pool).toBe("forks");
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/kept default isolation/));
    warn.mockRestore();

    // Explicitly off stays off.
    const off = reactNative({ engine: "native", hotRuntime: false }) as any;
    const plain = await runPluginConfig(off, { root: projectRoot }, SERVE_ENV);
    expect(plain.test.isolate).toBeUndefined();
  });

  it("refuses unrecyclable one-worker hot unless the risk is explicit", async () => {
    const bounded = reactNative({ engine: "native", hotRuntime: true }) as any;
    await expect(
      runPluginConfig(
        bounded,
        { root: projectRoot, test: { fileParallelism: false, maxWorkers: 1 } },
        SERVE_ENV,
      ),
    ).rejects.toThrow(/one worker.*allowUnboundedMemory:true/s);

    const explicit = reactNative({
      engine: "native",
      hotRuntime: { allowUnboundedMemory: true },
    }) as any;
    const cfg = await runPluginConfig(
      explicit,
      { root: projectRoot, test: { fileParallelism: false, maxWorkers: 1 } },
      SERVE_ENV,
    );
    expect(cfg.test.maxWorkers).toBeUndefined();
    expect(JSON.parse(cfg.test.env.VITEST_NATIVE_MEMORY_PLAN)).toMatchObject({
      enforced: false,
    });
  });

  it("preloads the export-condition recovery for both engines, after the user's execArgv", async () => {
    for (const engine of ["native", "mock"] as const) {
      const plugin = reactNative({ engine, hotRuntime: false }) as any;
      const result = await plugin.config.handler.call(
        {},
        { root: projectRoot, test: { execArgv: ["--user-flag"] } },
        SERVE_ENV,
      );
      const argv: string[] = result.test.execArgv;
      expect(argv.at(-2), engine).toBe("--import");
      expect(argv.at(-1), engine).toMatch(/native\/export-condition-recovery-preload\.mjs$/);
      expect(fs.existsSync(new URL(argv.at(-1)!)), engine).toBe(true);
    }
  });

  it("gives inline projects their own server so the plugin reaches them", async () => {
    const plugin = reactNative({ engine: "native" }) as any;
    const config = { root: projectRoot, test: { projects: [{ extends: true }] } };
    const result = await plugin.config.handler.call({}, config, SERVE_ENV);
    expect(config.test.projects).toEqual([{ extends: true, root: projectRoot }]);
    expect(result.test.setupFiles.length).toBeGreaterThan(0);
  });

  it("explicit hotRuntime fails on a Vitest setting it cannot honour", async () => {
    // 'auto' falls back to these (above); an explicit request must not be silently
    // rewritten in either direction.
    for (const test of [{ pool: "forks" }, { isolate: true }, { isolate: false }]) {
      const plugin = reactNative({ engine: "native", hotRuntime: true }) as any;
      await expect(
        runPluginConfig(plugin, { root: projectRoot, test: { maxWorkers: 2, ...test } }, SERVE_ENV),
        JSON.stringify(test),
      ).rejects.toThrow(/HOT_RUNTIME_OVERRIDDEN|cannot honour/);
    }
  });

  describe("configureVitest: reconciling CLI flags Vitest applied after config()", () => {
    async function hotProject(hotRuntime: unknown, root = projectRoot, test = {}) {
      const plugin = reactNative({ engine: "native", hotRuntime } as any) as any;
      const cfg = await runPluginConfig(
        plugin,
        { root, test: { maxWorkers: 3, ...test } },
        SERVE_ENV,
      );
      const config = { root, ...cfg.test, pool: "vitest-native" };
      return { plugin, config };
    }
    const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
    // Vitest applies CLI flags to the resolved config and also keeps them on their own.
    const run = (plugin: any, config: any, cli: Record<string, unknown>, v5 = false) => {
      Object.assign(config, cli);
      const vitest = v5 ? { config: { cliOptions: cli } } : { _cliOptions: cli };
      plugin.configureVitest({ vitest, project: { config } });
    };

    it("keeps hot when nothing overrode it", async () => {
      const { plugin, config } = await hotProject("auto");
      plugin.configureVitest({ vitest: { config: { cliOptions: {} } }, project: { config } });
      expect(config.pool).toBe("vitest-native");
      expect(config.isolate).toBe(false);
    });

    it("reads Vitest 5's config.cliOptions as well as Vitest 4's _cliOptions", async () => {
      const err = quiet();
      for (const v5 of [false, true]) {
        const { plugin, config } = await hotProject("auto");
        run(plugin, config, { isolate: false }, v5);
        expect(config.pool, `v5=${v5}`).toBe("threads");
        expect(config.isolate).toBe(false);
        expect(config.runner).toBeUndefined();
        expect(config.env.VITEST_NATIVE_MEMORY_PLAN).toBeUndefined();
      }
      expect(err).toHaveBeenCalledWith(expect.stringMatching(/hot runtime off: --no-isolate/));
      err.mockRestore();
    });

    it("gives back the worker count the memory plan may have capped", async () => {
      const err = quiet();
      const { plugin, config } = await hotProject("auto");
      config.maxWorkers = 2; // as the memory plan may have capped it
      run(plugin, config, { pool: "forks" });
      expect(config.isolate).toBe(true);
      expect(config.maxWorkers).toBe(3);

      // An explicit --maxWorkers is Vitest's to apply, and already has been.
      const flagged = await hotProject("auto");
      run(flagged.plugin, flagged.config, { maxWorkers: 1 });
      expect(flagged.config.pool).toBe("threads");
      expect(flagged.config.maxWorkers).toBe(1);
      err.mockRestore();
    });

    it("fails an explicit hotRuntime overridden on the command line", async () => {
      for (const [cli, reason] of [
        [{ pool: "forks" }, /the pool 'forks' was set/],
        [{ isolate: false }, /--no-isolate was passed/],
        [{ maxWorkers: 1 }, /maxWorkers is 1/],
      ] as const) {
        const { plugin, config } = await hotProject(true);
        expect(() => run(plugin, config, cli)).toThrow(reason);
      }
    });

    it("refuses a VM pool passed on the command line, hot or not", async () => {
      for (const hotRuntime of ["auto", false]) {
        const { plugin, config } = await hotProject(hotRuntime);
        expect(() => run(plugin, config, { pool: "vmThreads" }), String(hotRuntime)).toThrow(
          /cannot run on the 'vmThreads' pool/,
        );
      }
      // The mock engine needs no module hooks and runs on a VM pool.
      const mock = reactNative({ engine: "mock" }) as any;
      const config = { root: projectRoot, pool: "vmThreads" };
      expect(() =>
        mock.configureVitest({
          vitest: { _cliOptions: { pool: "vmThreads" } },
          project: { config },
        }),
      ).not.toThrow();
    });

    it("fails by name when a project shares a server without the plugin's setup", async () => {
      const { plugin, config } = await hotProject("auto");
      expect(() => run(plugin, { ...config, setupFiles: [] }, {})).toThrow(
        /SHARED_VITE_SERVER|shares a Vite server/,
      );
      // The project that does carry it runs.
      expect(() => run(plugin, config, {})).not.toThrow();
    });

    it("keys projects by Vitest's root, which test.root overrides", async () => {
      const err = quiet();
      const plugin = reactNative({ engine: "native", hotRuntime: "auto" }) as any;
      const testRoot = path.join(projectRoot, "tests");
      const cfg = await runPluginConfig(
        plugin,
        { root: projectRoot, test: { root: testRoot, maxWorkers: 2 } },
        SERVE_ENV,
      );
      const config = { ...cfg.test, root: testRoot, pool: "vitest-native" };
      run(plugin, config, { pool: "forks" });
      expect(config.isolate).toBe(true);
      err.mockRestore();
    });

    it("leaves an unset project worker count to the root config", async () => {
      const err = quiet();
      const plugin = reactNative({ engine: "native", hotRuntime: "auto" }) as any;
      const cfg = await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
      const config = { root: projectRoot, ...cfg.test, pool: "vitest-native" };
      Object.assign(config, { pool: "forks" });
      plugin.configureVitest({
        vitest: { _cliOptions: { pool: "forks" }, config: { maxWorkers: 2 } },
        project: { config },
      });
      expect(config.maxWorkers).toBeUndefined();
      err.mockRestore();
    });

    describe("a worker count Vitest resolved after config()", () => {
      const GIB = 1024 ** 3;
      // The host the rebuilt plan sees: 2 GiB admits four 256 MiB worker envelopes,
      // 4 GiB eleven.
      const host = (bytes: number) => {
        vi.spyOn(os, "totalmem").mockReturnValue(bytes);
        vi.spyOn(process, "constrainedMemory").mockReturnValue(0);
      };
      const poolWorker = (pool: any) =>
        pool.createPoolWorker({
          distPath: "/tmp/unused",
          project: {
            vitest: { logger: { outputStream: process.stdout, errorStream: process.stderr } },
          },
          method: "run",
          environment: { name: "node", options: null },
          execArgv: [],
          env: {},
        });
      async function hotWithPool(hotRuntime: unknown) {
        const plugin = reactNative({ engine: "native", hotRuntime } as any) as any;
        const cfg = await runPluginConfig(
          plugin,
          { root: projectRoot, test: { maxWorkers: 3 } },
          SERVE_ENV,
        );
        return { plugin, pool: cfg.test.pool, config: { root: projectRoot, ...cfg.test } };
      }
      const envPlan = (config: any) => JSON.parse(config.env.VITEST_NATIVE_MEMORY_PLAN);
      afterEach(() => vi.restoreAllMocks());

      it("rebuilds the memory plan for --maxWorkers, above the automatic cap of four", async () => {
        const { plugin, pool, config } = await hotWithPool("auto");
        expect(config.maxWorkers).toBe(3);
        const planned = poolWorker(pool).memoryLimit;
        host(4 * GIB);
        run(plugin, config, { maxWorkers: 10, pool: "vitest-native" });
        expect(config.pool).toBe("vitest-native");
        expect(config.isolate).toBe(false);
        expect(config.maxWorkers).toBe(10);
        expect(envPlan(config)).toMatchObject({
          requestedWorkers: 10,
          maxWorkers: 10,
          enforced: true,
          effectiveLimit: 4 * GIB,
        });
        // Workers created from here on recycle at the heap threshold sized for ten.
        const worker = poolWorker(pool);
        expect(worker.memoryLimit).toBe(envPlan(config).workerHeapLimit);
        expect(worker.memoryLimit).not.toBe(planned);
        expect(worker.memoryPlan).toMatchObject({ maxWorkers: 10 });
      });

      it("caps it to what memory admits, with a warning, and keeps hot", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        for (const hotRuntime of ["auto", true]) {
          const { plugin, pool, config } = await hotWithPool(hotRuntime);
          host(2 * GIB);
          // VITEST_MAX_WORKERS reaches the resolved config with no CLI flag at all.
          config.maxWorkers = 8;
          plugin.configureVitest({ vitest: { _cliOptions: {} }, project: { config } });
          expect(config.isolate, String(hotRuntime)).toBe(false);
          expect(config.maxWorkers).toBe(4);
          expect(envPlan(config)).toMatchObject({ requestedWorkers: 8, maxWorkers: 4 });
          expect(poolWorker(pool).memoryPlan).toMatchObject({ maxWorkers: 4 });
          expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(/capped maxWorkers from 8 to 4 for the host memory budget/),
          );
        }
      });

      it("admits a config-file count the same way, warning when memory caps it", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const plan = async (bytes: number, maxWorkers: number) => {
          host(bytes);
          const plugin = reactNative({ engine: "native" }) as any;
          const cfg = await runPluginConfig(
            plugin,
            { root: projectRoot, test: { maxWorkers } },
            SERVE_ENV,
          );
          return { maxWorkers: cfg.test.maxWorkers, plan: envPlan(cfg.test) };
        };
        expect(await plan(4 * GIB, 6)).toMatchObject({ maxWorkers: 6, plan: { maxWorkers: 6 } });
        expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/capped maxWorkers/));
        // Implicit 'auto' still says so: the user asked for a count they will not get.
        expect(await plan(2 * GIB, 8)).toMatchObject({ maxWorkers: 4 });
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(/capped maxWorkers from 8 to 4 for the host memory budget/),
        );
      });

      it("re-caps a count config() already planned and warned about, once", async () => {
        // Vitest 5 hands config() `--maxWorkers` too, then applies it again over the
        // capped count config() returned.
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        host(2 * GIB);
        const plugin = reactNative({ engine: "native" }) as any;
        const cfg = await runPluginConfig(
          plugin,
          { root: projectRoot, test: { maxWorkers: 8 } },
          SERVE_ENV,
        );
        const config = { root: projectRoot, ...cfg.test };
        const before = config.env.VITEST_NATIVE_MEMORY_PLAN;
        expect(config.maxWorkers).toBe(4);
        run(plugin, config, { maxWorkers: 8, pool: "vitest-native" });
        expect(config.maxWorkers).toBe(4);
        expect(config.env.VITEST_NATIVE_MEMORY_PLAN).toBe(before);
        expect(warn.mock.calls.filter(([m]) => /capped maxWorkers/.test(m))).toHaveLength(1);
      });

      it("prints the rebuilt plan under diagnostics", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const plugin = reactNative({ engine: "native", hotRuntime: "auto", diagnostics: true });
        const cfg = await runPluginConfig(
          plugin as any,
          { root: projectRoot, test: { maxWorkers: 2 } },
          SERVE_ENV,
        );
        const config = { root: projectRoot, ...cfg.test };
        log.mockClear();
        host(4 * GIB);
        run(plugin, config, { maxWorkers: 6, pool: "vitest-native" });
        expect(log).toHaveBeenCalledWith(
          expect.stringContaining("workers requested/admitted/selected: 6 / 11 / 6"),
        );
      });

      it("leaves the plan alone when Vitest kept the planned count", async () => {
        const { plugin, pool, config } = await hotWithPool("auto");
        const before = config.env.VITEST_NATIVE_MEMORY_PLAN;
        const limit = poolWorker(pool).memoryLimit;
        host(4 * GIB);
        run(plugin, config, { maxWorkers: 3, pool: "vitest-native" });
        expect(config.env.VITEST_NATIVE_MEMORY_PLAN).toBe(before);
        expect(poolWorker(pool).memoryLimit).toBe(limit);
      });

      it("keeps a hotRuntime.memoryLimit the user set", async () => {
        const { plugin, pool, config } = await hotWithPool({ memoryLimit: 123 * 1024 * 1024 });
        host(4 * GIB);
        run(plugin, config, { maxWorkers: 6, pool: "vitest-native" });
        expect(config.maxWorkers).toBe(6);
        expect(poolWorker(pool).memoryLimit).toBe(123 * 1024 * 1024);
        expect(poolWorker(pool).memoryPlan).toMatchObject({ maxWorkers: 6 });
      });

      it("leaves allowUnboundedMemory's worker count to Vitest", async () => {
        const { plugin, config } = await hotWithPool({ allowUnboundedMemory: true });
        const before = config.env.VITEST_NATIVE_MEMORY_PLAN;
        host(2 * GIB);
        run(plugin, config, { maxWorkers: 12, pool: "vitest-native" });
        expect(config.maxWorkers).toBe(12);
        expect(config.env.VITEST_NATIVE_MEMORY_PLAN).toBe(before);
      });

      it("gives Vitest's count back when the capped count conflicts with its group", async () => {
        const err = quiet();
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const { plugin, config } = await hotWithPool("auto");
        // Vitest 5 copies --maxWorkers into every project, so the plain one runs eight.
        const self = { name: "native", config };
        const other = { name: "plain", config: { maxWorkers: 8 } };
        host(2 * GIB);
        Object.assign(config, { maxWorkers: 8, pool: "vitest-native" });
        plugin.configureVitest({
          vitest: { config: { cliOptions: { maxWorkers: 8 } }, projects: [self, other] },
          project: self,
        });
        expect(err).toHaveBeenCalledWith(
          expect.stringMatching(
            /hot runtime off: the project 'plain'.*8 workers to this project's 4/,
          ),
        );
        expect(config.isolate).toBe(true);
        expect(config.maxWorkers).toBe(8);
        expect(config.env.VITEST_NATIVE_MEMORY_PLAN).toBeUndefined();
      });
    });

    it("falls back when another project in its group runs a different worker count", async () => {
      const err = quiet();
      const { plugin, config } = await hotProject("auto");
      const self = { name: "native", config };
      // A plain project beside it: Vitest would resolve its worker count to 9 on 10 CPUs.
      const other = { name: "mock", config: { maxWorkers: config.maxWorkers + 5 } };
      plugin.configureVitest({
        vitest: { _cliOptions: {}, config: {}, projects: [self, other] },
        project: self,
      });
      expect(config.isolate).toBe(true);
      expect(config.runner).toBeUndefined();
      expect(err).toHaveBeenCalledWith(
        expect.stringMatching(/hot runtime off: the project 'mock'/),
      );

      const explicit = await hotProject(true);
      const explicitSelf = { name: "native", config: explicit.config };
      expect(() =>
        explicit.plugin.configureVitest({
          vitest: { _cliOptions: {}, config: {}, projects: [explicitSelf, other] },
          project: explicitSelf,
        }),
      ).toThrow(/HOT_RUNTIME_OVERRIDDEN|sequence.groupOrder/);

      // Its own group keeps hot.
      const separate = await hotProject("auto");
      separate.config.sequence = { groupOrder: 1 };
      const separateSelf = { name: "native", config: separate.config };
      separate.plugin.configureVitest({
        vitest: { _cliOptions: {}, config: {}, projects: [separateSelf, other] },
        project: separateSelf,
      });
      expect(separate.config.isolate).toBe(false);
      err.mockRestore();
    });

    it("decides per project when projects share the plugin instance", async () => {
      // `extends: true` projects inherit the root's plugin instance, so one
      // configureVitest call must not decide for the others.
      const err = quiet();
      const plugin = reactNative({ engine: "native", hotRuntime: "auto" }) as any;
      const roots = [projectRoot, path.join(projectRoot, "tests")];
      const configs = [];
      for (const root of roots) {
        const cfg = await runPluginConfig(plugin, { root, test: { maxWorkers: 2 } }, SERVE_ENV);
        configs.push({ root, ...cfg.test, pool: "vitest-native" });
      }
      for (const config of configs) run(plugin, config, { pool: "forks" });
      // The flag lands in every project; only the revert restores per-file isolation.
      expect(configs.map((c) => c.isolate)).toEqual([true, true]);
      expect(configs.map((c) => c.runner)).toEqual([undefined, undefined]);
      err.mockRestore();
    });
  });

  it("hotRuntime object form wires recycling policy into the pool worker", async () => {
    const plugin = reactNative({
      engine: "native",
      hotRuntime: { recycleAfterFiles: 2, memoryLimit: 1024 },
    }) as any;
    const cfg = await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
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
    const cfg = await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
    expect(cfg.test.pool).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("hotRuntime"))).toBe(true);
    warn.mockRestore();
  });

  it("explicit mock virtualizes react-native", async () => {
    const plugin = reactNative({ engine: "mock" }) as any;
    await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
    expect(plugin.resolveId("react-native", undefined)).toBe("\0virtual:react-native");
  });
});

describe("engine-selection notices", () => {
  const resetBanner = () =>
    delete (globalThis as { __vitest_native_banner_printed?: boolean })
      .__vitest_native_banner_printed;
  beforeEach(resetBanner);

  it("auto prints exactly the one-line engine banner on stderr when it selects native", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const plugin = reactNative({}) as any;
    await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
    // stdout must stay clean — it belongs to reporters (e.g. --reporter=json).
    expect(log.mock.calls.filter((c) => String(c[0]).includes("[vitest-native]"))).toHaveLength(0);
    const banners = err.mock.calls.filter((c) => String(c[0]).includes("[vitest-native]"));
    expect(banners).toHaveLength(1);
    expect(String(banners[0][0])).toContain("engine: native — real react-native");
    log.mockRestore();
    err.mockRestore();
  });

  it("the native banner names the hot runtime when it is selected, and only then", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const banner = () =>
      String(err.mock.calls.find((c) => String(c[0]).includes("engine:"))?.[0] ?? "");

    await runPluginConfig(
      reactNative({ engine: "native" }) as any,
      { root: projectRoot },
      SERVE_ENV,
    );
    expect(banner()).toMatch(/\(platform ios, hot runtime\)$/);

    resetBanner();
    err.mockClear();
    await runPluginConfig(
      reactNative({ engine: "native" }) as any,
      { root: projectRoot, test: { isolate: true } },
      SERVE_ENV,
    );
    expect(banner()).toMatch(/\(platform ios\)$/);
    err.mockRestore();
  });

  it("the engine banner prints once per process, not once per project", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const plugin = reactNative({}) as any;
    await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
    await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
    const banners = err.mock.calls.filter((c) => String(c[0]).includes("engine:"));
    expect(banners).toHaveLength(1);
    err.mockRestore();
  });

  it("auto WARNS about the mock fallback when native deps are absent, and banners mock", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-nudge-"));
    try {
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        JSON.stringify({ name: "x", version: "0.0.0" }),
      );
      const plugin = reactNative({}) as any;
      await runPluginConfig(plugin, { root: tmp }, SERVE_ENV);
      const notices = warn.mock.calls.filter((c) =>
        String(c[0]).includes("not found — using the mock engine"),
      );
      expect(notices).toHaveLength(1);
      const banners = err.mock.calls.filter((c) => String(c[0]).includes("engine: mock"));
      expect(banners).toHaveLength(1);
    } finally {
      warn.mockRestore();
      err.mockRestore();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("explicit engine:'native' without its transform deps fails at config time", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-failfast-"));
    try {
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        JSON.stringify({ name: "x", version: "0.0.0" }),
      );
      const plugin = reactNative({ engine: "native" }) as any;
      await expect(runPluginConfig(plugin, { root: tmp }, SERVE_ENV)).rejects.toThrow(
        /missing: react-native, @react-native\/babel-preset, @babel\/core/s,
      );
    } finally {
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

  it("preserves blessed resident listeners but resets file-owned Expo state", () => {
    installGlobals();
    const expo = (globalThis as { expo?: any }).expo;
    const controller = expo[Symbol.for("vitest-native.expo.reset")];
    const residentModule = expo.modules.VNResidentImport;
    const fileModule = expo.modules.VNFileOwned;

    function residentInit() {
      return residentModule.addListener("change", () => {});
    }
    const residentSub = residentInit();
    fileModule.addListener("change", () => {});
    fileModule.override = "file-owned";
    const firstFabricatedClass = fileModule.FileSystemFile;

    controller.bless((stack: string) => stack.includes("residentInit"));
    controller();

    expect(residentModule.listenerCount("change")).toBe(1);
    expect(fileModule.listenerCount("change")).toBe(0);
    expect(Object.hasOwn(fileModule, "override")).toBe(false);
    expect(controller.verify()).toBe(true);
    expect(fileModule.FileSystemFile).not.toBe(firstFabricatedClass);

    residentSub.remove();
    controller();
  });

  it("serves a package's own mock for its native module, as jest-expo does", () => {
    installGlobals();
    const g = globalThis as Record<string, any>;
    const expo = g.expo;
    class NativeClass {
      a() {}
      b() {}
    }
    const digest = vi.fn((input: string) => `digest:${input}`);
    g.__vitest_native_expo_modules = {
      present: () => true,
      seed: (name: string) =>
        name === "VNMockedModule"
          ? { members: { digest, documentRoot: "/mock", NativeClass }, complete: true }
          : null,
    };
    try {
      const mocked = expo.modules.VNMockedModule;
      expect(mocked.digest("x")).toBe("digest:x");
      expect(mocked.documentRoot).toBe("/mock");
      expect(mocked.NativeClass).toBe(NativeClass);
      // The mock is the whole module: nothing is invented for what it leaves out.
      expect(mocked.cacheRoot).toBeUndefined();
      expect(mocked.fetchAsync).toBeUndefined();
      expect(typeof mocked.addListener).toBe("function");
      // A module without one keeps the conventions.
      expect(typeof expo.modules.VNUnmockedModule.fetchAsync).toBe("function");

      // A file's calls and overrides do not reach the next; the implementation stays.
      digest.mockReturnValue("overridden");
      expect(mocked.digest("y")).toBe("overridden");
      expo[Symbol.for("vitest-native.expo.reset")]();
      expect(digest).not.toHaveBeenCalled();
      expect(mocked.digest("z")).toBe("digest:z");

      // A mock that keeps state is reset with the reset it exports, once per file.
      const store = new Set<string>();
      const resetStore = vi.fn(() => store.clear());
      g.__vitest_native_expo_modules = {
        present: () => true,
        seed: (name: string) =>
          name === "VNStatefulModule"
            ? {
                members: {
                  write: vi.fn((v: string) => store.add(v)),
                  __resetMockStore: resetStore,
                },
                complete: true,
              }
            : null,
      };
      expo.modules.VNStatefulModule.write("a");
      // A file that overrode the reset does not stop it running.
      resetStore.mockImplementation(() => {});
      expo[Symbol.for("vitest-native.expo.reset")]();
      expect(store.size).toBe(0);
      expect(resetStore).not.toHaveBeenCalled(); // its own call history is reset too
    } finally {
      delete g.__vitest_native_expo_modules;
    }
  });

  it("keeps a package mock's values through the per-file reset, whatever they are", () => {
    installGlobals();
    const g = globalThis as Record<string, any>;
    const expo = g.expo;
    const when = new Date(0);
    const helpers = { sum: (a: number, b: number) => a + b };
    g.__vitest_native_expo_modules = {
      present: () => true,
      seed: (name: string) =>
        name === "VNRichMockModule"
          ? { members: { when, helpers, inf: Infinity, big: 10n }, complete: true }
          : null,
    };
    try {
      const mocked = expo.modules.VNRichMockModule;
      expo[Symbol.for("vitest-native.expo.reset")]();
      expect(mocked.when).toBe(when);
      expect(mocked.helpers.sum(1, 2)).toBe(3);
      expect(mocked.inf).toBe(Infinity);
      expect(mocked.big).toBe(10n);
    } finally {
      delete g.__vitest_native_expo_modules;
    }
  });

  it("seeds a module from Expo's table as jest-expo answers it, keeping conventions for the rest", () => {
    installGlobals();
    const g = globalThis as Record<string, any>;
    const expo = g.expo;
    const mockFn = (impl: () => unknown) => vi.fn(impl);
    g.__vitest_native_expo_modules = {
      present: () => true,
      seed: (name: string) => {
        const members = expoModuleTableMembers(os.tmpdir(), name, mockFn);
        return members ? { members, complete: false, listsConstants: true } : null;
      },
    };
    try {
      // The values jest-expo's mock() gives ExpoDevice's table entries.
      const device = expo.modules.ExpoDevice;
      expect(device.modelName).toBe("mock");
      expect(device.deviceYearClass).toBe(2026);
      expect(device.isDevice).toBe(false);
      expect(device.supportedCpuArchitectures).toEqual([]);
      expect(vi.isMockFunction(device.getUptimeAsync)).toBe(true);
      expect(device.getUptimeAsync()).toBeInstanceOf(Promise);
      // A member the table does not list: an async function or a class keeps the stub's
      // conventions, and anything else is undefined, as under jest-expo.
      expect(device.someNewerMethodAsync()).toBeInstanceOf(Promise);
      expect(typeof device.SomeNewerClass).toBe("function");
      expect(device.someNewerConstant).toBeUndefined();
      // A file's change to a seeded value does not reach the next file.
      const constants = expo.modules.ExponentConstants;
      constants.platform.changed = true;
      expo[Symbol.for("vitest-native.expo.reset")]();
      expect(constants.platform).toEqual({});
      expect(constants.statusBarHeight).toBe(54);
      expect(constants.executionEnvironment).toBe("mock");
    } finally {
      delete g.__vitest_native_expo_modules;
    }
  });

  it("answers every member the table leaves out by the conventions when the table is another SDK's", () => {
    installGlobals();
    const g = globalThis as Record<string, any>;
    const mockFn = (impl: () => unknown) => vi.fn(impl);
    g.__vitest_native_expo_modules = {
      present: () => true,
      seed: (name: string) => {
        const members = expoModuleTableMembers(os.tmpdir(), name, mockFn);
        return members ? { members, complete: false, listsConstants: false } : null;
      },
    };
    try {
      const battery = g.expo.modules.ExpoBattery;
      expect(vi.isMockFunction(battery.getBatteryLevelAsync)).toBe(true);
      // An SDK 57 member absent from SDK 58's table (ExpoAppMetrics.getAllSessions) is
      // callable, as before the table.
      expect(battery.someMemberOfAnotherSdk()).toBeUndefined();
    } finally {
      delete g.__vitest_native_expo_modules;
    }
  });
});

// @ts-expect-error — runtime .mjs
import {
  expoModuleMock,
  expoModuleMockIndex,
  expoAbsentModules,
  expoModuleTableDescribesInstalledSdk,
  expoModuleTableFor,
  expoModuleTableMembers,
} from "../src/native/expo-module-mocks.mjs";

describe("Expo native module presence", () => {
  const make = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-presence-"));
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    const mod = (dir: string, files: Record<string, string>) => {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.writeFileSync(path.join(root, dir, "package.json"), JSON.stringify({ version: "1.0.0" }));
      fs.writeFileSync(path.join(root, dir, "expo-module.config.json"), "{}");
      for (const [file, src] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, dir, file)), { recursive: true });
        fs.writeFileSync(path.join(root, dir, file), src);
      }
    };
    return { root, mod };
  };

  it("is absent only when probed for and defined by no installed or local module", () => {
    const { root, mod } = make();
    try {
      mod("node_modules/expo-image", {
        "ios/ImageModule.swift": 'Name("ExpoImage")',
        "build/observe.js":
          "requireOptionalNativeModule('ExpoObserve'); requireOptionalNativeModule('ExpoHaptics');",
      });
      mod("node_modules/expo-haptics", {
        "ios/HapticsModule.swift": '@ExpoModule("ExpoHaptics")',
        "build/index.js": "requireOptionalNativeModule('ExpoHaptics');",
      });
      // A local module (modules/, which Expo autolinks) that a package probes for.
      mod("modules/my-module", { "ios/MyModule.swift": 'Name("MyModule")' });
      mod("node_modules/acme", { "build/index.js": "requireOptionalNativeModule('MyModule');" });
      const absent = expoAbsentModules(root, path.join(root, "cache"));
      expect([...absent]).toEqual(["ExpoObserve"]);
      const [cached] = fs.readdirSync(path.join(root, "cache"));
      expect(cached).toMatch(/^expo-native-modules-[0-9a-f]{16}\.json$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a required module present whatever the scan finds", () => {
    // create-expo-module's library layout: the module is the project root itself.
    const { root, mod } = make();
    try {
      fs.writeFileSync(path.join(root, "expo-module.config.json"), "{}");
      fs.mkdirSync(path.join(root, "src"));
      fs.writeFileSync(path.join(root, "src", "index.ts"), "requireNativeModule('MyLib');");
      mod("node_modules/expo-crypto", { "build/index.js": "requireNativeModule('ExpoCrypto');" });
      expect(expoAbsentModules(root, null).size).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("answers expo.modules from the presence check", () => {
    installGlobals();
    const g = globalThis as Record<string, any>;
    g.__vitest_native_expo_modules = {
      present: (name: string) => name !== "VNAbsentModule",
      seed: () => null,
    };
    try {
      expect(g.expo.modules.VNAbsentModule).toBeUndefined();
      expect("VNAbsentModule" in g.expo.modules).toBe(false);
      expect(typeof g.expo.modules.VNPresentModule.addListener).toBe("function");
      expect("VNPresentModule" in g.expo.modules).toBe(true);
    } finally {
      delete g.__vitest_native_expo_modules;
    }
  });
});

describe("Expo's table of the native modules", () => {
  // A project with `expo` of `expoVersion` installed, or none.
  const project = (expoVersion: string | null, nested = false) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-sdk-"));
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    if (expoVersion) {
      fs.mkdirSync(path.join(root, "node_modules", "expo"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "node_modules", "expo", "package.json"),
        // An `exports` that does not list ./package.json, as a package's may not.
        JSON.stringify({ name: "expo", version: expoVersion, exports: { ".": "./index.js" } }),
      );
    }
    if (!nested) return root;
    // A workspace member: expo is hoisted to the root.
    const member = path.join(root, "apps", "app");
    fs.mkdirSync(member, { recursive: true });
    fs.writeFileSync(path.join(member, "package.json"), "{}");
    return member;
  };

  it("has a table per SDK, each extracted from that SDK's published jest-expo", async () => {
    // @ts-expect-error — runtime .mjs
    const { default: tables } = await import("../src/native/expo-module-tables.mjs");
    const sdks = Object.keys(tables).map(Number);
    expect(sdks).toEqual(expect.arrayContaining([57, 58]));
    for (const sdk of sdks) {
      const table = tables[sdk];
      expect(table.sdk).toBe(sdk);
      expect(table.source).toMatch(new RegExp(`^jest-expo@${sdk}\\.\\d+\\.\\d+$`));
      expect(table.license).toBe("MIT");
      // jest-expo's whole notice ships with its data, as its licence requires.
      const file = fs.readFileSync(
        fileURLToPath(new URL(`../src/native/expo-module-table-${sdk}.mjs`, import.meta.url)),
        "utf8",
      );
      expect(file).toContain("Copyright (c) 2015-present 650 Industries, Inc.");
      expect(file).toContain(
        "The above copyright notice and this permission notice shall be included",
      );
      const modules = Object.keys(table.modules);
      expect(modules.length).toBeGreaterThan(50);
      expect(modules).toEqual(expect.arrayContaining(["ExpoDevice", "ExponentConstants"]));
    }
    // The SDKs differ: SDK 57's ExpoUpdates has constants SDK 58's lacks.
    expect(Object.keys(tables[57].modules.ExpoUpdates)).toContain("manifest");
    expect(Object.keys(tables[58].modules.ExpoUpdates)).not.toContain("manifest");
  });

  it("answers from the installed SDK's table", () => {
    const sdk57 = project("57.0.4");
    const sdk58 = project("58.0.16");
    const mockFn = (fn: () => unknown) => fn;
    try {
      expect(expoModuleTableMembers(sdk57, "ExpoUpdates", mockFn)).toHaveProperty("manifest");
      expect(expoModuleTableMembers(sdk58, "ExpoUpdates", mockFn)).not.toHaveProperty("manifest");
      // Any type jest-expo's mock() does not name answers `{}`, as there.
      expect(expoModuleTableMembers(sdk58, "ExponentConstants", mockFn)?.manifest).toEqual({});
      expect(expoModuleTableMembers(sdk58, "VNNoSuchModule", mockFn)).toBeNull();
    } finally {
      for (const root of [sdk57, sdk58]) fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("is exact for an SDK with a table, else the nearest SDK's stands in", () => {
    const cases: [string | null, boolean, number, boolean][] = [
      // expo version, nested in a workspace, table SDK, exact
      ["58.0.3", false, 58, true],
      ["57.0.9", true, 57, true],
      ["58.0.0-canary-20260909-ea7a89a", false, 58, true],
      ["56.0.6", false, 57, false],
      ["59.0.0", false, 58, false],
      [null, false, 58, false],
    ];
    const roots = cases.map(([version, nested]) => project(version, nested));
    try {
      expect(
        roots.map((root) => {
          const { sdk, exact } = expoModuleTableFor(root);
          return [sdk, exact, expoModuleTableDescribesInstalledSdk(root)];
        }),
      ).toEqual(cases.map(([, , sdk, exact]) => [sdk, exact, exact]));
    } finally {
      for (const root of roots) {
        fs.rmSync(
          root.endsWith(path.join("apps", "app")) ? path.dirname(path.dirname(root)) : root,
          {
            recursive: true,
            force: true,
          },
        );
      }
    }
  });
});

describe("Expo module mocks", () => {
  it("indexes the mocks/ of installed Expo modules by native module name", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-mocks-"));
    try {
      const pkg = (dir: string, files: Record<string, string>, expoModule = true) => {
        fs.mkdirSync(path.join(root, dir, "mocks"), { recursive: true });
        fs.writeFileSync(path.join(root, dir, "package.json"), "{}");
        if (expoModule) fs.writeFileSync(path.join(root, dir, "expo-module.config.json"), "{}");
        for (const [file, src] of Object.entries(files)) {
          fs.writeFileSync(path.join(root, dir, "mocks", file), src);
        }
      };
      // A third-party Expo module counts when the project declares it.
      fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ dependencies: { "@scope/expo-thing": "1.0.0" } }),
      );
      pkg("node_modules/expo-crypto", {
        "ExpoCrypto.js": "exports.digest = () => 'd'; exports.size = 1;",
        "ExpoCrypto.d.ts": "",
      });
      pkg("node_modules/@scope/expo-thing", { "ExpoThing.js": "exports.x = () => 1;" });
      pkg("node_modules/expo/node_modules/expo-asset", { "ExpoAsset.js": "exports.y = 1;" });
      // The project's own copy wins over one nested inside another package.
      pkg("node_modules/expo/node_modules/expo-font", { "ExpoFont.js": "exports.v = 'nested';" });
      pkg("node_modules/expo-font", { "ExpoFont.js": "exports.v = 'top';" });
      // Undeclared and not named after Expo, but an Expo module: its mocks count.
      pkg("node_modules/@other/thing", { "OtherThing.js": "exports.u = 1;" });
      pkg("node_modules/.pnpm/expo-haptics@58.0.0/node_modules/expo-haptics", {
        "ExpoHaptics.js": "exports.z = 1;",
      });
      // Not an Expo module: its mocks/ are its own business.
      pkg("node_modules/some-lib", { "SomeLib.js": "exports.w = 1;" }, false);

      const index = expoModuleMockIndex(root);
      expect([...index.keys()].sort()).toEqual([
        "ExpoAsset",
        "ExpoCrypto",
        "ExpoFont",
        "ExpoHaptics",
        "ExpoThing",
        "OtherThing",
      ]);
      expect(expoModuleMock(root, "ExpoFont", (fn: () => unknown) => fn).v).toBe("top");
      const members = expoModuleMock(root, "ExpoCrypto", (fn: () => unknown) => vi.fn(fn));
      expect(members.size).toBe(1);
      expect(vi.isMockFunction(members.digest)).toBe(true);
      expect(members.digest()).toBe("d");
      expect(expoModuleMock(root, "NotAModule", vi.fn)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

import { gestureHandler } from "../src/presets/index.js";

describe("plugin subpath resolution (mock engine)", () => {
  async function makePlugin() {
    const plugin = reactNative({ engine: "mock", presets: [gestureHandler()] }) as any;
    await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
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

  it("does not redirect preset package.json, asset, or utility subpaths", async () => {
    const plugin = await makePlugin();
    expect(plugin.resolveId("react-native-gesture-handler/package.json", undefined)).toBe(
      undefined,
    );
    expect(plugin.resolveId("react-native-gesture-handler/assets/icon.png", undefined)).toBe(
      undefined,
    );
    expect(plugin.resolveId("react-native-gesture-handler/jest-utils", undefined)).toBe(undefined);
    expect(plugin.resolveId("react-native-gesture-handler/jestSetup", undefined)).toBe(undefined);
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

describe("parseReactNativeExports", () => {
  it("reads React Native's real index, covering every member shape", () => {
    const names = parseReactNativeExports(fs.readFileSync(path.join(RN, "index.js"), "utf8"));
    expect(names).toContain("View"); // lazy getter
    expect(names).toContain("unstable_batchedUpdates"); // generic method shorthand
    expect(names).toContain("Systrace"); // plain property
    expect(names).not.toContain("get");
    expect(names).not.toContain("configurable"); // key of a defineProperty after the object
    expect(names.length).toBeGreaterThan(80);
  });

  it("ignores members of nested objects", () => {
    const source = [
      "module.exports = {",
      "  get View(): View {",
      "    return require('./View').default;",
      "  },",
      "  Nested: {",
      "    notAnExport: 1,",
      "    alsoNot() {},",
      "  },",
      "  plain: 1,",
      "};",
    ].join("\n");
    expect(parseReactNativeExports(source).sort()).toEqual(["Nested", "View", "plain"]);
  });

  it("returns nothing when the index has no exports object", () => {
    expect(parseReactNativeExports("const a = 1;")).toEqual([]);
  });

  it("stops at the end of the exports object", () => {
    const source = [
      "module.exports = {",
      "  get View() {",
      "    return require('./View').default;",
      "  },",
      "} as ReactNativePublicAPI;",
      "Object.defineProperty(module.exports, 'Touchable', {",
      "  configurable: true,",
      "  get() {},",
      "});",
    ].join("\n");
    expect(parseReactNativeExports(source)).toEqual(["View"]);
  });
});

describe("parseDeprecatedReactNativeExports", () => {
  it("finds the members whose getter calls warnOnce in React Native's real index", () => {
    const source = fs.readFileSync(path.join(RN, "index.js"), "utf8");
    const deprecated = parseDeprecatedReactNativeExports(source);
    expect(deprecated).toContain("SafeAreaView");
    expect(deprecated).toContain("Clipboard");
    expect(deprecated).not.toContain("View");
    expect(deprecated).not.toContain("Pressable");
    const names = parseReactNativeExports(source);
    for (const name of deprecated) expect(names).toContain(name);
  });

  it("attributes each warnOnce call to its own member only", () => {
    const source = [
      "module.exports = {",
      "  get Before() {",
      "    return 1;",
      "  },",
      "  /**",
      "   * @deprecated Old is deprecated.",
      "   */",
      "  get Old() {",
      "    warnOnce('old', 'Old is deprecated.');",
      "    return 2;",
      "  },",
      "  get After() {",
      "    return 3;",
      "  },",
      "} as ReactNativePublicAPI;",
      "if (__DEV__) {",
      "  warnOnce('outside', 'not a member');",
      "}",
    ].join("\n");
    expect(parseDeprecatedReactNativeExports(source)).toEqual(["Old"]);
  });
});

describe("hot pool: Vitest version guard", () => {
  // The hot worker ships inside this package, so `import 'vitest/worker'` there
  // resolves from the PACKAGE, not the project. When a monorepo puts a different
  // Vitest VERSION on each side, the two speak different protocol versions and the
  // run reports nothing at all — no error, no tests, sometimes exit 0. The pool has
  // to refuse at config time instead.
  const fakeProject = (version: string): string => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-pool-"));
    const vitestDir = path.join(dir, "node_modules", "vitest");
    fs.mkdirSync(vitestDir, { recursive: true });
    fs.writeFileSync(
      path.join(vitestDir, "package.json"),
      JSON.stringify({ name: "vitest", version, main: "index.js" }),
    );
    fs.writeFileSync(path.join(vitestDir, "index.js"), "module.exports = {};");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "p" }));
    return dir;
  };
  const workerEntry = path.join(HERE, "..", "src", "native", "worker.mjs");
  const installedVitest = JSON.parse(
    fs.readFileSync(createRequire(import.meta.url).resolve("vitest/package.json"), "utf8"),
  ) as { version: string };

  it("throws when the two resolve different Vitest versions", () => {
    expect(() => nativePool({ workerEntry, projectRoot: fakeProject("9.9.9") })).toThrow(
      /would load vitest@.*but this run is driven by vitest@9\.9\.9/s,
    );
  });

  it("allows a second install of the SAME version", () => {
    // Two node_modules trees holding one version are two module registries but
    // identical code — they interoperate. Failing on the paths alone would block
    // working monorepos, so only a version difference is an error.
    expect(() =>
      nativePool({ workerEntry, projectRoot: fakeProject(installedVitest.version) }),
    ).not.toThrow();
  });

  it("does not throw for this repository's own layout", () => {
    expect(() => nativePool({ workerEntry, projectRoot })).not.toThrow();
  });

  it("makes 'auto' fall back instead of failing, and keeps explicit hot fail-closed", async () => {
    // A project that resolves every real dependency from this repository, except a
    // Vitest of another version. Under the default the user never asked for hot, so
    // the mismatch is a reason to keep per-file isolation, not an error.
    const mismatched = fakeProject("9.9.9");
    const repoModules = path.join(projectRoot, "node_modules");
    // Each package links to its REAL path: install layouts (bun's among them) make
    // node_modules entries relative symlinks into a store, which a link to their
    // parent directory would resolve from the wrong place — on Windows especially.
    const link = (name: string): void => {
      const target = path.join(mismatched, "node_modules", name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(
        fs.realpathSync(path.join(repoModules, name)),
        target,
        process.platform === "win32" ? "junction" : "dir",
      );
    };
    for (const entry of fs.readdirSync(repoModules)) {
      if (entry === "vitest" || entry.startsWith(".")) continue;
      if (entry.startsWith("@")) {
        for (const scoped of fs.readdirSync(path.join(repoModules, entry))) {
          link(`${entry}/${scoped}`);
        }
      } else {
        link(entry);
      }
    }
    // Guard the fixture itself: if an install layout left the native engine's
    // requirements unresolvable here, the plugin would fail for that reason instead,
    // and the assertions below would test the wrong thing.
    const fixtureRequire = createRequire(path.join(mismatched, "package.json"));
    for (const required of ["react-native", "@react-native/babel-preset", "@babel/core"]) {
      expect(() => fixtureRequire.resolve(`${required}/package.json`), required).not.toThrow();
    }
    expect(fixtureRequire("vitest/package.json").version).toBe("9.9.9");
    // The React Native registry is irrelevant to runtime selection, and compiling it
    // for a fresh project root is the slow part of a plugin config run.
    vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
    try {
      const byDefault = await runPluginConfig(
        reactNative({ engine: "native" }) as any,
        { root: mismatched, test: { maxWorkers: 2 } },
        SERVE_ENV,
      );
      expect(byDefault.test.isolate).toBeUndefined();
      expect(byDefault.test.env.VITEST_NATIVE_MEMORY_PLAN).toBeUndefined();

      await expect(
        runPluginConfig(
          reactNative({ engine: "native", hotRuntime: true }) as any,
          { root: mismatched, test: { maxWorkers: 2 } },
          SERVE_ENV,
        ),
      ).rejects.toThrow(/would load vitest@.*but this run is driven by vitest@9\.9\.9/s);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 30_000);
});

describe("peer requirements", () => {
  const vitestReq = PEER_REQUIREMENTS.find((r) => r.name === "vitest")!;

  it("accepts Vitest 4 and 5, and rejects 6", () => {
    // The manifest's peer range and this table are the same promise stated twice;
    // a check that only asserted the table would let them drift apart.
    const manifest = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8")) as {
      peerDependencies: Record<string, string>;
    };
    expect(manifest.peerDependencies.vitest).toBe(">=4 <6");
    expect(vitestReq.maximumMajor).toBe(6);
  });

  it("accepts a Vitest 5 prerelease", () => {
    // Vitest 5 is reachable only through its beta tag for now, and the version
    // parser has mishandled prereleases before (4.0.0-beta.x hard-errored at
    // startup for early adopters).
    // A fresh directory per version: package.json is read through require(), whose
    // module cache would otherwise serve the first version for every later check.
    const check = (version: string) => {
      const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-peer-"));
      const vitestDir = path.join(dir, "node_modules", "vitest");
      fs.mkdirSync(vitestDir, { recursive: true });
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "p" }));
      fs.writeFileSync(
        path.join(vitestDir, "package.json"),
        JSON.stringify({ name: "vitest", version }),
      );
      return validatePeerDependency("vitest", vitestReq.minimum, dir, vitestReq.maximumMajor);
    };
    expect(check("5.0.0-beta.6")).toBe(null);
    expect(check("5.0.0")).toBe(null);
    expect(check("4.1.8")).toBe(null);
    expect(check("6.0.0")).toMatch(/supports vitest >= 4\.0\.0 and < 6/);
    expect(check("3.2.7")).toMatch(/requires vitest >= 4\.0\.0/);
  });
});

import { cjsExportNames } from "../src/native/transform.mjs";

describe("cjsExportNames", () => {
  it("reads keys the lexer stops at", () => {
    // The shape Node mis-reads: it takes the leading method and gives up at the
    // first arrow-valued property.
    const names = cjsExportNames(
      "let n = 0;\nmodule.exports = { Banner({ label }) { return label; }, renderCount: () => n, platformSeen: () => 'ios' };",
    );
    expect(names.sort()).toEqual(["Banner", "platformSeen", "renderCount"]);
  });

  it("reads exports.foo assignments, including mixed with a literal", () => {
    expect(cjsExportNames("exports.a = 1;\nmodule.exports.b = 2;").sort()).toEqual(["a", "b"]);
  });

  it("drops default and __esModule, which Node supplies itself", () => {
    expect(cjsExportNames("module.exports = { default: 1, __esModule: true, a: 2 };")).toEqual([
      "a",
    ]);
  });

  it("returns nothing when the shape is not statically knowable", () => {
    // `module.exports = someValue` leaves Node's own detection in charge rather
    // than inventing names that may not exist at run time.
    expect(cjsExportNames("const impl = {};\nmodule.exports = impl;")).toEqual([]);
  });

  it("skips computed and spread keys rather than guessing", () => {
    expect(cjsExportNames("const k='x';\nmodule.exports = { [k]: 1, ...other, ok: 2 };")).toEqual([
      "ok",
    ]);
  });

  it("returns nothing for unparseable input instead of throwing", () => {
    expect(cjsExportNames("module.exports = {")).toEqual([]);
  });
});

// @ts-expect-error — runtime .mjs
import { createExpoNativeModuleResolver } from "../src/native/expo-native-modules.mjs";

describe("the Expo native module resolver", () => {
  it("answers each module from its layers in order", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-resolver-"));
    try {
      fs.writeFileSync(path.join(root, "package.json"), "{}");
      const pkg = (dir: string, files: Record<string, string>) => {
        fs.mkdirSync(path.join(root, dir), { recursive: true });
        fs.writeFileSync(
          path.join(root, dir, "package.json"),
          JSON.stringify({ version: "1.0.0" }),
        );
        fs.writeFileSync(path.join(root, dir, "expo-module.config.json"), "{}");
        for (const [file, src] of Object.entries(files)) {
          fs.mkdirSync(path.dirname(path.join(root, dir, file)), { recursive: true });
          fs.writeFileSync(path.join(root, dir, file), src);
        }
      };
      // A package mock, a probe for a module nothing defines, and a probe for one a
      // package mock stands in for.
      pkg("node_modules/expo-crypto", {
        "mocks/ExpoCrypto.js": "exports.digest = () => 'd';",
        "ios/CryptoModule.swift": 'Name("ExpoCrypto")',
        "build/index.js":
          "requireOptionalNativeModule('ExpoObserve'); requireOptionalNativeModule('MockedOnly');",
      });
      pkg("node_modules/expo-mocked-only", { "mocks/MockedOnly.js": "exports.x = 1;" });
      const resolver = createExpoNativeModuleResolver({
        projectRoot: root,
        cacheDir: () => null,
        mockFn: (fn: () => unknown) => vi.fn(fn),
      });
      // Layer 1: absent only when probed for and defined nowhere, unless mocked.
      expect(resolver.present("ExpoObserve")).toBe(false);
      expect(resolver.present("MockedOnly")).toBe(true);
      expect(resolver.present("AnythingElse")).toBe(true);
      // Layer 2: the package mock is the whole module.
      const own = resolver.seed("ExpoCrypto");
      expect(own.complete).toBe(true);
      expect(own.members.digest()).toBe("d");
      // Layer 3: Expo's table, partial. No expo is installed, so no table is the
      // installed SDK's and the stub answers every member it leaves out.
      const listed = resolver.seed("ExpoDevice");
      expect(listed.complete).toBe(false);
      expect(listed.listsConstants).toBe(false);
      expect(listed.members.modelName).toBe("mock");
      // With expo installed, its SDK's table, which lists the module's constants. (A
      // project of its own: the table chosen is cached per project root.)
      const sdk57 = path.join(root, "sdk57");
      fs.mkdirSync(path.join(sdk57, "node_modules", "expo"), { recursive: true });
      fs.writeFileSync(path.join(sdk57, "package.json"), "{}");
      fs.writeFileSync(
        path.join(sdk57, "node_modules", "expo", "package.json"),
        JSON.stringify({ name: "expo", version: "57.0.24" }),
      );
      const onSdk57 = createExpoNativeModuleResolver({
        projectRoot: sdk57,
        cacheDir: () => null,
        mockFn: (fn: () => unknown) => vi.fn(fn),
      }).seed("ExpoUpdates");
      expect(onSdk57.listsConstants).toBe(true);
      expect(onSdk57.members.manifest).toEqual({});
      // Layer 4: nothing to seed; the stub answers.
      expect(resolver.seed("AnythingElse")).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
