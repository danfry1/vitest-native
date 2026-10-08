/**
 * Differential oracle: platform-file resolution is checked against REAL
 * metro-resolver, not against this package's beliefs about it.
 *
 * Why an oracle and not literals: the extension-interleaving order was once
 * wrong here — platform-major instead of Metro's extension-major — and the unit
 * test asserting the order had been written FROM the implementation, so the gate
 * encoded the mistake it existed to catch. Literals can restate a belief; only
 * the external implementation can contradict one.
 *
 * The pinned devDependency version runs in the PR gate (this file). The weekly
 * compat workflow bumps metro-resolver@latest alongside react-native@latest and
 * re-runs this same file, so upstream resolution changes surface as scheduled
 * drift without destabilizing PRs.
 *
 * Scope: extensionless relative specifiers (`./m`, `./dir`) — the surface
 * resolvePlatformFile owns. Package/haste/asset/exports resolution is Node's or
 * Vite's and is not decided by this list.
 */
import { afterAll, describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
// @ts-expect-error — runtime .mjs
import {
  resolvePlatformFile,
  resolveRelativePlatformFile,
  METRO_SOURCE_EXTS,
} from "../src/native/resolve.mjs";

const req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const metro: any = req("metro-resolver");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-metro-oracle-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const origin = path.join(root, "origin.js");
fs.writeFileSync(origin, "");

/** Minimal metro-resolver context for relative source-file resolution. */
function contextFor(originModulePath: string, sourceExts = METRO_SOURCE_EXTS) {
  return {
    originModulePath,
    sourceExts: [...sourceExts],
    preferNativePlatform: true,
    // React Native's resolverMainFields (@react-native/metro-config, dist/index.js).
    mainFields: ["react-native", "browser", "main"],
    nodeModulesPaths: [],
    extraNodeModules: null,
    allowHaste: false,
    disableHierarchicalLookup: true,
    doesFileExist: (f: string) => {
      try {
        return fs.statSync(f).isFile();
      } catch {
        return false;
      }
    },
    fileSystemLookup: (f: string) => {
      try {
        const st = fs.statSync(f);
        return { exists: true, type: st.isFile() ? "f" : "d", realPath: fs.realpathSync(f) };
      } catch {
        return { exists: false };
      }
    },
    getPackage: (f: string) => {
      try {
        return JSON.parse(fs.readFileSync(f, "utf8"));
      } catch {
        return null;
      }
    },
    getPackageForModule: () => null,
    isAssetFile: () => false,
    redirectModulePath: (p: string) => p,
    resolveAsset: () => null,
    resolveHasteModule: () => null,
    resolveHastePackage: () => null,
    unstable_conditionNames: [],
    unstable_conditionsByPlatform: {},
    unstable_enablePackageExports: false,
    unstable_logWarning: () => {},
    customResolverOptions: {},
    assetExts: new Set<string>(),
  };
}

function metroResolve(specifier: string, platform: "ios" | "android"): string | null {
  try {
    const r = metro.resolve(contextFor(origin), specifier, platform);
    return r && r.type === "sourceFile" ? fs.realpathSync(r.filePath) : null;
  } catch {
    return null;
  }
}

function ours(base: string, platform: "ios" | "android"): string | null {
  const r = resolvePlatformFile(base, platform);
  return r ? fs.realpathSync(r) : null;
}

let caseId = 0;
/** Create `m<N>.<variant>` files for each [variantSuffix, ext] pair; return the base name. */
function writeCase(files: Array<[string, string]>): string {
  const name = `m${caseId++}`;
  for (const [variant, ext] of files) {
    const suffix = variant === "" ? `.${ext}` : `.${variant}.${ext}`;
    fs.writeFileSync(path.join(root, name + suffix), "");
  }
  return name;
}

describe("platform resolution agrees with real metro-resolver", () => {
  it("matches the external oracle across project-specific ordered profiles", () => {
    const profiles = [METRO_SOURCE_EXTS, ["tsx", "ts", "mjs", "js", "json", "cjs"], ["svg", "js"]];
    let checked = 0;
    for (const sourceExts of profiles) {
      for (const first of sourceExts) {
        for (const last of sourceExts) {
          const name = writeCase([
            ["native", first],
            ["ios", last],
          ]);
          for (const platform of ["ios", "android"] as const) {
            const actual = resolvePlatformFile(path.join(root, name), platform, sourceExts);
            const expected = metro.resolve(contextFor(origin, sourceExts), `./${name}`, platform);
            expect(expected.type).toBe("sourceFile");
            expect(fs.realpathSync(actual!)).toBe(fs.realpathSync(expected.filePath));
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(130);
  });
  it("across a sweep of mixed platform/extension variant sets", () => {
    // Every non-empty subset of variant kinds, each carrying either the first or
    // the last source extension — the assignment that maximally separates
    // extension-major from platform-major interleaving.
    const kinds = ["ios", "android", "native", ""];
    const exts = ["js", "tsx"];
    const disagreements: string[] = [];
    let cases = 0;
    for (let mask = 1; mask < 1 << kinds.length; mask++) {
      const chosen = kinds.filter((_, i) => mask & (1 << i));
      const assignments: Array<Array<[string, string]>> = [[]];
      for (const kind of chosen) {
        const next: Array<Array<[string, string]>> = [];
        for (const partial of assignments) {
          for (const ext of exts) next.push([...partial, [kind, ext]]);
        }
        assignments.length = 0;
        assignments.push(...next);
      }
      for (const files of assignments) {
        const name = writeCase(files);
        for (const platform of ["ios", "android"] as const) {
          cases++;
          const expected = metroResolve(`./${name}`, platform);
          const actual = ours(path.join(root, name), platform);
          if (expected !== actual) {
            disagreements.push(
              `${platform} ${JSON.stringify(files)} -> metro: ${expected}, ours: ${actual}`,
            );
          }
        }
      }
    }
    // 15 non-empty subsets of 4 kinds, 2^k extension assignments each = 80
    // file layouts, × 2 platforms. Asserted exactly so a sweep-shrinking edit
    // cannot silently reduce coverage.
    expect(cases).toBe(160);
    expect(disagreements).toEqual([]);
  });

  it("for the remaining source extensions (jsx, json, ts)", () => {
    for (const ext of ["jsx", "json", "ts"]) {
      const name = writeCase([
        ["native", ext],
        ["ios", "tsx"],
        ["", "tsx"],
      ]);
      for (const platform of ["ios", "android"] as const) {
        expect(ours(path.join(root, name), platform)).toBe(metroResolve(`./${name}`, platform));
      }
    }
  });

  it("for directory index resolution", () => {
    const dir = path.join(root, "pkgdir");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "index.native.js"), "");
    fs.writeFileSync(path.join(dir, "index.ios.tsx"), "");
    for (const platform of ["ios", "android"] as const) {
      expect(ours(dir, platform)).toBe(metroResolve("./pkgdir", platform));
    }
  });

  it("for a request ending in a separator, which names the directory only", () => {
    // `./lib/` beside `lib.ts`: metro-resolver's resolveModulePath skips the file
    // lookup for a trailing separator, as Node does.
    fs.writeFileSync(path.join(root, "slashlib.ts"), "");
    fs.mkdirSync(path.join(root, "slashlib"));
    fs.writeFileSync(path.join(root, "slashlib", "index.ts"), "");
    for (const platform of ["ios", "android"] as const) {
      const expected = metroResolve("./slashlib/", platform);
      expect(expected).toBe(fs.realpathSync(path.join(root, "slashlib", "index.ts")));
      const actual = resolveRelativePlatformFile("./slashlib/", origin, platform);
      expect(fs.realpathSync(actual)).toBe(expected);
      // Without the separator the file wins, for both.
      expect(ours(path.join(root, "slashlib"), platform)).toBe(
        metroResolve("./slashlib", platform),
      );
    }
  });

  it("for a directory with a package.json, through its main fields", () => {
    const cases: Array<[string, Record<string, unknown>, string[]]> = [
      ["main-ts", { main: "main.ts" }, ["main.ts", "index.ts"]],
      [
        "main-extless",
        { main: "./lib/entry" },
        ["lib/entry.native.ts", "lib/entry.ts", "index.ts"],
      ],
      ["rn-field", { "react-native": "rn.ts", main: "main.ts" }, ["rn.ts", "main.ts", "index.ts"]],
      ["main-dir", { main: "./src" }, ["src/index.ios.ts", "src/index.ts", "index.ts"]],
      ["no-main", { name: "x" }, ["index.native.ts", "index.ts"]],
    ];
    for (const [name, manifest, files] of cases) {
      const dir = path.join(root, name);
      for (const rel of files) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), "");
      }
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
      for (const platform of ["ios", "android"] as const) {
        const expected = metroResolve(`./${name}`, platform);
        expect(expected, name).not.toBe(null);
        expect(ours(dir, platform), `${name} on ${platform}`).toBe(expected);
      }
    }
  });
});
