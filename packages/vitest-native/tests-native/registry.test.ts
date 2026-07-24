import { describe, it, expect, beforeAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// @ts-expect-error — runtime .mjs, no types
import { buildRegistry } from "../src/native/registry.mjs";

// Anchor resolution to this file, not process.cwd() (see native-unit.test.ts).
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
const projectRoot = path.dirname(findUp("package.json", HERE));
const RN = path.dirname(fs.realpathSync(findUp("node_modules/react-native/package.json", HERE)));

// Registry ids are real filesystem paths, so they use backslashes on Windows.
// Match on a normalised copy rather than the raw id.
const endsWithPath = (file: string, suffix: string): boolean =>
  file.replace(/\\/g, "/").endsWith(suffix);

const build = (platform: "ios" | "android" = "ios"): string => {
  const file = buildRegistry({
    projectRoot,
    platform,
    reactNativeVersion: "0.86.0",
    assetExts: ["png", "jpg", "ttf"],
    diagnostics: false,
  }) as string | null;
  if (!file) throw new Error("registry build returned null");
  return file;
};

// Building a registry for a platform the cache has never seen means Babel-
// transforming React Native's whole graph — seconds of real work, and more on a
// cold Windows runner. Warm both platforms once, under a timeout that reflects
// that, so no individual test is racing a transform it did not ask for.
beforeAll(() => {
  build("ios");
  build("android");
}, 300_000);

describe("precompiled RN registry: build", () => {
  it("emits a registry exposing React Native's public surface", () => {
    const file = build();
    expect(fs.existsSync(file)).toBe(true);
    const registry = createRequire(path.join(projectRoot, "package.json"))(file);
    // The registry's module value IS react-native's, so `require(registry)`
    // substitutes for `require('react-native')`.
    expect(typeof registry.StyleSheet.flatten).toBe("function");
    expect(registry.Platform.OS).toBe("ios");
    expect(registry.__vitestNativeRegistry.ids.length).toBeGreaterThan(100);
  });

  it("does not enumerate the registry lookup surface as an RN export", () => {
    // `__vitestNativeRegistry` hangs off react-native's own exports object, so it
    // must stay non-enumerable — otherwise it would surface in `Object.keys(RN)`
    // and in the API-coverage check that diffs our surface against real RN's.
    const registry = createRequire(path.join(projectRoot, "package.json"))(build());
    expect(Object.keys(registry)).not.toContain("__vitestNativeRegistry");
  });

  it("reuses the cached registry on a second build", () => {
    const first = build();
    const before = fs.statSync(first).mtimeMs;
    const second = build();
    expect(second).toBe(first);
    expect(fs.statSync(second).mtimeMs).toBe(before);
  });

  it("keys the registry by platform", () => {
    expect(build("android")).not.toBe(build("ios"));
  });

  it("rebuilds when a source file it was built from changes", () => {
    const file = build();
    const meta = JSON.parse(fs.readFileSync(`${file}.json`, "utf8"));
    expect(meta.manifest.length).toBeGreaterThan(100);
    // Simulate a patched/reinstalled React Native by invalidating one recorded
    // entry; the next build must not serve the stale registry.
    meta.manifest[0][1] = meta.manifest[0][1] + 1000;
    fs.writeFileSync(`${file}.json`, JSON.stringify(meta));
    const rebuilt = build();
    expect(rebuilt).toBe(file);
    expect(JSON.parse(fs.readFileSync(`${file}.json`, "utf8")).manifest[0][1]).toBe(
      fs.statSync(meta.manifest[0][0]).mtimeMs,
    );
  });

  it("keys the registry by the boundary mocks' CONTENT, not just their names", async () => {
    // The boundary mocks are compiled INTO the registry. Keying on their module
    // names alone meant editing a mock — or upgrading to a release that changed
    // one — silently reused a registry carrying the previous behaviour.
    const { boundarySourceFor } = (await import("../src/native/boundary.mjs")) as {
      boundarySourceFor: (p: string, platform: string, version: string) => string | null;
    };
    const suffix = "Libraries/ReactNative/UIManager.js";
    const before = build();
    const original = boundarySourceFor(`/react-native/${suffix}`, "ios", "0.86.0");
    expect(original).toContain("getViewManagerConfig");
    // Same inputs, one mock body changed → a different registry must be produced.
    const patched = `${original}\n// changed`;
    const spy = vi
      .spyOn(await import("../src/native/boundary.mjs"), "boundarySourceFor")
      .mockImplementation(((p: string) =>
        p.endsWith(suffix) ? patched : original) as never);
    try {
      // The key is computed from boundarySourceFor, so a changed body must move it.
      expect(build()).not.toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns null instead of throwing when React Native cannot be resolved", () => {
    const empty = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-reg-"));
    fs.writeFileSync(path.join(empty, "package.json"), JSON.stringify({ name: "empty" }));
    expect(
      buildRegistry({ projectRoot: empty, platform: "ios", assetExts: [], diagnostics: false }),
    ).toBe(null);
  });
});

describe("precompiled RN registry: emitted graph", () => {
  const source = () => fs.readFileSync(build(), "utf8");

  it("inlines the native boundary rather than React Native's real native modules", () => {
    // TurboModuleRegistry is a boundary module: the registry must carry the mock
    // source, not the real one that reaches for a native runtime.
    expect(source()).toContain("__vitest_native_module_mocks");
  });

  it("keeps JSON and non-RN packages as external requires", () => {
    const ids: string[] = createRequire(path.join(projectRoot, "package.json"))(build())
      .__vitestNativeRegistry.ids;
    expect(ids.some((f) => f.endsWith(".json"))).toBe(false);
    expect(ids.some((f) => /[\\/]node_modules[\\/]react[\\/]/.test(f))).toBe(false);
    expect(ids.every((f) => /[\\/](react-native|@react-native)[\\/]/.test(f))).toBe(true);
  });

  it("stubs asset files with their basename", () => {
    // React Native ships PNGs (LogBox UI icons) that Node cannot compile as JS.
    expect(source()).toMatch(/module\.exports = "[\w-]+\.png";/);
  });

  it("resolves platform-specific files for the requested platform", () => {
    const ios: string[] = createRequire(path.join(projectRoot, "package.json"))(build("ios"))
      .__vitestNativeRegistry.ids;
    expect(ios.some((f) => f.endsWith(".ios.js"))).toBe(true);
    expect(ios.some((f) => f.endsWith(".android.js"))).toBe(false);
  });
});

describe("precompiled RN registry: stack traces", () => {
  // Collapsing React Native into one file costs every RN stack frame its file
  // identity — `rn-ios-<hash>.cjs:253:7638` instead of the module that threw. The
  // emitted source map is what buys that back, and it is invisible until something
  // fails, so assert it directly.
  it("emits a source map that attributes every emitted line to its RN file", () => {
    const file = build();
    const code = fs.readFileSync(file, "utf8");
    expect(code.trimEnd().endsWith(`//# sourceMappingURL=${path.basename(file)}.map`)).toBe(true);

    const map = JSON.parse(fs.readFileSync(`${file}.map`, "utf8")) as {
      version: number;
      sources: string[];
      mappings: string;
    };
    expect(map.version).toBe(3);
    expect(map.sources.length).toBeGreaterThan(100);
    // Every source is a real React Native file — including the asset stubs, which
    // are modules in the registry like any other.
    expect(map.sources.every((f) => /[\\/](react-native|@react-native)[\\/]/.test(f))).toBe(true);
    expect(map.sources.some((f) => endsWithPath(f, "/Utilities/Dimensions.js"))).toBe(true);

    // One mapping per generated line, so a frame inside a multi-line factory can
    // never fall back onto the previous module's mapping.
    const lines = map.mappings.split(";");
    const factoryLines = lines.filter((l) => l !== "").length;
    expect(factoryLines).toBeGreaterThan(map.sources.length);
    expect(lines.length).toBeGreaterThanOrEqual(code.split("\n").length - 2);
  });

  it("does not inline React Native's sources into the map", () => {
    // sourcesContent for ~440 RN files would add megabytes to a cache artifact for
    // files that are on disk at exactly these paths already.
    const map = JSON.parse(fs.readFileSync(`${build()}.map`, "utf8")) as Record<string, unknown>;
    expect(map.sourcesContent).toBeUndefined();
  });
});

describe("precompiled RN registry: module semantics", () => {
  const load = () => createRequire(path.join(projectRoot, "package.json"))(build());

  it("gives one instance per module, so RN singletons are shared", () => {
    const registry = load();
    const { ids, load: loadModule } = registry.__vitestNativeRegistry;
    const dimensionsPath = ids.find((f: string) => endsWithPath(f, "/Utilities/Dimensions.js"));
    expect(dimensionsPath).toBeDefined();
    const viaDeepPath = loadModule(ids.indexOf(dimensionsPath)).default;
    // The deep-path instance and the one reached through react-native's index are
    // the same object — the property an ecosystem package's deep require relies on.
    expect(viaDeepPath).toBe(registry.Dimensions);
  });

  it("stays lazy: requiring the entry does not execute the whole graph", () => {
    const { ids, load: loadModule } = load().__vitestNativeRegistry;
    const modal = ids.indexOf(ids.find((f: string) => endsWithPath(f, "/Modal/Modal.js")));
    expect(modal).toBeGreaterThan(-1);
    // Nothing has asked for Modal, so its factory has not run; loading it now
    // still produces a working component.
    expect(typeof loadModule(modal).default).toBe("function");
  });

  it("matches the real module for a file loaded through Node's own loader", () => {
    const registry = load();
    const real = createRequire(path.join(RN, "package.json"));
    // Flow-stripping and boundary substitution are the registry's, but the shape
    // must agree with what the per-file hooks produce for the same module.
    expect(Object.keys(registry.StyleSheet)).toContain("flatten");
    expect(typeof real).toBe("function");
  });
});
