/**
 * One config evaluation resolves each package's directory once.
 *
 * Detection, the linked-package check and the ownership policy (its external patterns
 * and each of its matchers) all ask where the same packages live. Before they shared
 * a lookup, an Expo project resolved each of several hundred packages four to five
 * times per config call. These tests pin two things: the shared lookup gives exactly
 * the answers the uncached one gives, whatever spelling the root arrives in, and the
 * plugin never resolves the same package from the same directory twice.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { projectContext } from "../src/context.mjs";

// Every lookup the plugin makes, by lookup function, directory and package. The mock routes the
// defaults of packagePatterns and buildPkgMatcher through the counter too, so a
// caller that drops the shared lookup and falls back to the uncached one is seen.
const lookups = vi.hoisted(() => ({ on: false, keys: [] as string[] }));
vi.mock("../src/native/match.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/native/match.mjs")>();
  const packageDirOf = (name: string, fromDir: string) => {
    if (lookups.on) lookups.keys.push(`packageDirOf ${path.resolve(fromDir)} ${name}`);
    return actual.packageDirOf(name, fromDir);
  };
  const dependencyDirOf = (name: string, fromDir: string) => {
    if (lookups.on) lookups.keys.push(`dependencyDirOf ${path.resolve(fromDir)} ${name}`);
    return actual.dependencyDirOf(name, fromDir);
  };
  return {
    ...actual,
    packageDirOf,
    dependencyDirOf,
    memoizePackageDirOf: (resolve = packageDirOf) => actual.memoizePackageDirOf(resolve),
    packagePatterns: (name: string, root?: string, dirOf = packageDirOf) =>
      actual.packagePatterns(name, root, dirOf),
    buildPkgMatcher: (pkgs: string[] | undefined, root?: string, dirOf = packageDirOf) =>
      actual.buildPkgMatcher(pkgs, root, dirOf),
  };
});

const { memoizePackageDirOf, packageDirOf, packagePatterns } =
  await import("../src/native/match.mjs");
const { createNativeOwnershipPolicy, findNativeInlineConflicts } =
  await import("../src/native/ownership.mjs");
const { reactNative } = await import("../src/plugin.js");
const { runPluginConfig } = await import("./plugin-config.js");

/**
 * base/
 *   real/node_modules/divergent-lib     seen only from the REAL spelling of the app
 *   real/x/app/                          the project
 *     node_modules/plain-lib
 *     node_modules/@scope/scoped-lib     its exports map leaves out ./package.json
 *     node_modules/linked-lib -> base/packages/linked-lib
 *     node_modules/outer/node_modules/plain-lib   a second copy, seen from `outer`
 *   packages/linked-lib                  a workspace link: no node_modules segment
 *   link -> real/x                       a symlinked spelling of the app's parent
 */
let base: string;
let realApp: string;
let linkApp: string;
const NAMES = [
  "plain-lib",
  "@scope/scoped-lib",
  "linked-lib",
  "divergent-lib",
  "missing-lib",
  "app",
];

const write = (file: string, json: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json));
};
const pkg = (dir: string, name: string, extra: Record<string, unknown> = {}) => {
  write(path.join(dir, "package.json"), { name, version: "1.0.0", main: "index.js", ...extra });
  fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};\n");
};

beforeAll(() => {
  base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-dircache-"));
  realApp = path.join(base, "real", "x", "app");
  pkg(realApp, "app");
  pkg(path.join(realApp, "node_modules", "plain-lib"), "plain-lib");
  pkg(path.join(realApp, "node_modules", "@scope", "scoped-lib"), "@scope/scoped-lib", {
    exports: { ".": "./index.js" },
  });
  pkg(path.join(base, "packages", "linked-lib"), "linked-lib");
  fs.symlinkSync(
    path.join(base, "packages", "linked-lib"),
    path.join(realApp, "node_modules", "linked-lib"),
    "junction",
  );
  pkg(path.join(realApp, "node_modules", "outer"), "outer");
  pkg(path.join(realApp, "node_modules", "outer", "node_modules", "plain-lib"), "plain-lib");
  pkg(path.join(base, "real", "node_modules", "divergent-lib"), "divergent-lib");
  fs.symlinkSync(path.join(base, "real", "x"), path.join(base, "link"), "junction");
  linkApp = path.join(base, "link", "app");
});

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

/** The same directory as callers may spell it. */
const spellings = () => [
  realApp,
  `${realApp}${path.sep}`,
  path.join(realApp, "..", "app"),
  linkApp,
  ...(process.platform === "win32" ? [realApp.replaceAll("\\", "/")] : []),
];
const fromDirs = () => [...spellings(), path.join(realApp, "node_modules", "outer")];

describe("memoizePackageDirOf", () => {
  it("answers exactly as packageDirOf does, for every package and spelling", () => {
    const memo = memoizePackageDirOf();
    // Twice over: the second pass is answered from the cache.
    for (let pass = 0; pass < 2; pass++) {
      for (const fromDir of fromDirs()) {
        for (const name of NAMES) {
          expect(memo(name, fromDir), `${name} from ${fromDir}`).toBe(packageDirOf(name, fromDir));
        }
      }
    }
  });

  it("resolves each package once per directory", () => {
    const resolve = vi.fn(packageDirOf);
    const memo = memoizePackageDirOf(resolve);
    for (let pass = 0; pass < 3; pass++) for (const name of NAMES) memo(name, realApp);
    expect(resolve).toHaveBeenCalledTimes(NAMES.length);
  });

  it("keeps a symlinked spelling apart from the real one, because Node does", () => {
    // Node builds the lookup paths from the directory as written. The real spelling
    // walks base/real/node_modules; the linked one never passes through it. A cache
    // keyed by real path would hand one spelling the other's answer.
    expect(packageDirOf("divergent-lib", realApp)).not.toBeNull();
    expect(packageDirOf("divergent-lib", linkApp)).toBeNull();
    const memo = memoizePackageDirOf();
    expect(memo("divergent-lib", linkApp)).toBeNull();
    expect(memo("divergent-lib", realApp)).toBe(packageDirOf("divergent-lib", realApp));
    expect(memo("divergent-lib", linkApp)).toBeNull();
  });

  it("answers in Node's real-path spelling whichever spelling asked", () => {
    const memo = memoizePackageDirOf();
    const linked = fs.realpathSync(path.join(base, "packages", "linked-lib"));
    for (const fromDir of spellings()) expect(memo("linked-lib", fromDir)).toBe(linked);
  });
});

describe("ownership policy with a shared lookup", () => {
  const options = (projectRoot: string) => ({
    projectRoot,
    explicitTransforms: ["plain-lib", "linked-lib"],
    ecosystemPackages: ["@scope/scoped-lib", "divergent-lib", "missing-lib", "app"],
    runtimeTransforms: ["outer"],
    projectDirs: [projectRoot],
  });
  const probes = () => [
    path.join(realApp, "node_modules", "plain-lib", "index.js"),
    path.join(realApp, "node_modules", "outer", "node_modules", "plain-lib", "index.js"),
    path.join(realApp, "node_modules", "@scope", "scoped-lib", "index.js"),
    path.join(base, "packages", "linked-lib", "index.js"),
    path.join(base, "real", "node_modules", "divergent-lib", "index.js"),
    path.join(realApp, "src", "index.ts"),
    path.join(realApp, "src", "index.test.ts"),
    path.join(base, "elsewhere", "index.js"),
  ];
  const observe = (policy: ReturnType<typeof createNativeOwnershipPolicy>) => ({
    externalPatterns: policy.externalPatterns.map(String),
    manifest: policy.manifest(),
    matches: probes().map((file) => policy.matchesNodeTransformedFile(file)),
    decisions: probes().map((file) => policy.decideFile(file)),
    dirs: NAMES.map((name) => policy.packageDirOf(name)),
    inline: findNativeInlineConflicts(policy, ["plain-lib", /linked-lib/, "divergent-lib"]),
  });

  it("comes out identical to a fresh policy, from every spelling of the root", () => {
    // One lookup shared across every spelling, as a plugin instance's config calls
    // might share one: warmed from each spelling in turn, it must never leak an answer
    // from one into another.
    const shared = memoizePackageDirOf();
    for (const root of [...spellings(), ...spellings().reverse()]) {
      const cached = createNativeOwnershipPolicy({ ...options(root), packageDirOf: shared });
      const fresh = createNativeOwnershipPolicy(options(root));
      expect(observe(cached), root).toEqual(observe(fresh));
    }
  });

  it("builds the same patterns the uncached rule does", () => {
    for (const root of spellings()) {
      const policy = createNativeOwnershipPolicy(options(root));
      const expected = policy.nodeTransformPackages
        .flatMap((name) => packagePatterns(name, path.resolve(root), packageDirOf))
        .map(String);
      expect(policy.externalPatterns.map(String).slice(-expected.length), root).toEqual(expected);
    }
  });
});

describe("one lookup per package per config call", () => {
  it("never resolves a package from the same directory twice", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    const plugin = reactNative({ engine: "native" });
    lookups.keys = [];
    lookups.on = true;
    try {
      await runPluginConfig(plugin, { root });
    } finally {
      lookups.on = false;
    }
    // The fixture root detects React Native libraries, so the policy has packages to
    // resolve; without them this would pass vacuously.
    for (const lookup of ["packageDirOf", "dependencyDirOf"]) {
      expect(
        lookups.keys.some((key) => key.startsWith(lookup) && key.endsWith(" rn-ecosystem-lib")),
        lookup,
      ).toBe(true);
    }
    const repeated = [...new Set(lookups.keys.filter((key, i) => lookups.keys.indexOf(key) !== i))];
    expect(repeated).toEqual([]);
  });
});

/**
 * A throwaway project whose native toolchain comes from this repository's install.
 * `links` maps a dependency name to a directory symlinked into the app's node_modules.
 */
function app(dependencies: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-dircache-app-"));
  made.push(root);
  const here = path.resolve(import.meta.dirname, "..");
  for (const name of ["react-native", "@react-native/babel-preset", "@babel/core"]) {
    const to = path.join(root, "node_modules", name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.symlinkSync(fs.realpathSync(path.join(here, "node_modules", name)), to, "junction");
  }
  write(path.join(root, "package.json"), { name: "app", private: true, dependencies });
  return root;
}
const made: string[] = [];
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** The packages a config call hands Node to transform. */
async function nodeTransformed(plugin: ReturnType<typeof reactNative>, root: string) {
  const log = console.log;
  const warn = console.warn;
  console.log = console.warn = () => {};
  try {
    const config = await runPluginConfig(plugin, { root });
    const context = projectContext(config.test.env.VITEST_NATIVE_CONTEXT) as {
      transform?: string[];
    } | null;
    return context?.transform ?? [];
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

describe("cache lifetime", () => {
  it("sees a package installed between two config calls on the same plugin", async () => {
    // Vitest reloads the config on a watch-mode restart. Whether that builds a new
    // plugin instance depends on where reactNative() is called, so the cache must
    // not outlive one config call: a package installed in between must be detected.
    const root = app({ "late-rn-lib": "*" });
    const plugin = reactNative({ engine: "native" });
    expect(await nodeTransformed(plugin, root)).not.toContain("late-rn-lib");
    pkg(path.join(root, "node_modules", "late-rn-lib"), "late-rn-lib", {
      peerDependencies: { "react-native": "*" },
    });
    expect(await nodeTransformed(plugin, root)).toContain("late-rn-lib");
    expect(await nodeTransformed(reactNative({ engine: "native" }), root)).toContain("late-rn-lib");
  }, 60_000);
});

describe("detection keeps its own lookup", () => {
  it("leaves out a workspace member whose exports omit ./package.json", async () => {
    // Detection asks dependencyDirOf, not packageDirOf: a linked workspace member is
    // detected only when `<name>/package.json` resolves. Sharing the policy's
    // packageDirOf lookup with detection would find this one and hand it to Node.
    const root = app({ "@m/kit": "*", "@m/kit-exported": "*" });
    const member = (name: string, exportsManifest: boolean) => {
      const dir = path.join(path.dirname(root), `${path.basename(root)}-${name.slice(3)}`);
      made.push(dir);
      pkg(dir, name, {
        exports: {
          ".": "./index.js",
          ...(exportsManifest ? { "./package.json": "./package.json" } : {}),
        },
        peerDependencies: { "react-native": "*" },
      });
      const link = path.join(root, "node_modules", name);
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(dir, link, "junction");
    };
    member("@m/kit", false);
    member("@m/kit-exported", true);
    const transformed = await nodeTransformed(reactNative({ engine: "native" }), root);
    // The control: the same member with ./package.json exported is detected.
    expect(transformed).toContain("@m/kit-exported");
    expect(transformed).not.toContain("@m/kit");
  }, 60_000);
});
