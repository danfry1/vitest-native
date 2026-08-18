/**
 * The project's own package must never be auto-detected as an ecosystem dependency.
 *
 * In a workspace the package under test is normally declared as a dependency by a
 * sibling or by the repository root, so it turns up in the candidate set like any
 * third-party library — and it declares React Native, because it *is* React Native
 * code. Detection then claimed it: its directory became a `server.deps.external`
 * pattern, Vitest handed every file under it to Node, and the loader compiled them to
 * CommonJS. A test file's own `import { it } from 'vitest'` became `require('vitest')`
 * and threw "Vitest cannot be imported in a CommonJS module using require()", with
 * `Tests: no tests` and nothing pointing at the cause. It reproduced in one workspace
 * package and not another purely because only one of them was declared as a
 * dependency somewhere.
 *
 * Under pnpm the resolution that makes this possible is routine: every workspace
 * member is linked into a hidden directory that pnpm puts on NODE_PATH, so a package
 * resolves its own name from its own directory.
 *
 * The `react-native` export condition is NOT involved, however much it looks like it
 * — see tests-native/cjs-export-condition.test.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";
import { nativeEngineConfig } from "../src/native/apply.js";
import { testIncludeRoots } from "../src/plugin.js";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, value: unknown) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

/**
 * Make a package resolvable from `dependent`, the way a package manager linking a
 * workspace member does.
 *
 * Written as an installed copy rather than a symlink deliberately: a link into the
 * package's own directory is self-referential, and cleaning one up on Windows is its
 * own hazard. Nothing under test depends on the link — the guard reads the manifests
 * it has already walked — so the simpler shape is also the more faithful test of it.
 */
function installInto(dependent: string, name: string, manifest: Record<string, unknown>) {
  write(dependent, path.join("node_modules", ...name.split("/"), "package.json"), manifest);
}

/**
 * A workspace with two React Native packages, where `app` depends on
 * `lib`. Both are ordinary workspace members; the only difference between them
 * is which one the run is in.
 */
function workspace(): { root: string; lib: string; app: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-self-")));
  made.push(root);
  const libManifest = {
    name: "@w/lib",
    version: "1.0.0",
    peerDependencies: { "react-native": "*" },
  };
  write(root, "package.json", { name: "w", private: true, workspaces: ["packages/*"] });
  write(root, "packages/lib/package.json", libManifest);
  write(root, "packages/app/package.json", {
    name: "@w/app",
    version: "1.0.0",
    dependencies: { "@w/lib": "workspace:*" },
    peerDependencies: { "react-native": "*" },
  });
  const lib = path.join(root, "packages", "lib");
  const app = path.join(root, "packages", "app");
  installInto(app, "@w/lib", libManifest);
  return { root, lib, app };
}

describe("ecosystem detection and the package under test", () => {
  it("does not detect the package the run is inside", () => {
    const { lib } = workspace();
    expect(detectEcosystemPackages(lib)).not.toContain("@w/lib");
  });

  it("still detects that same package when another package is under test", () => {
    // The discriminating half: the guard keys on where the run is, not on the
    // package. From `app`, `@w/lib` is a genuine workspace dependency and
    // must stay detected — that is the dual-ownership fix this must not undo.
    const { app } = workspace();
    expect(detectEcosystemPackages(app)).toContain("@w/lib");
  });

  it("recognises the package the tests live in when the run root is above it", () => {
    // An Nx-style run from the repository root: the root says only "the repository",
    // so the package holding the tests looked like an ordinary dependency and had its
    // whole directory externalized — its own source compiled to CommonJS while its
    // test files were not. `test.include` pointing into the package identifies it.
    const { root, lib } = workspace();
    expect(detectEcosystemPackages(root, [], [path.join(lib, "src")])).not.toContain("@w/lib");
  });

  it("ignores an include pattern that names nothing above the root", () => {
    // The discriminating half. Vitest's default include is `**/*.test.ts`, which
    // points at the whole repository; treating that as a hint would mark every
    // workspace member as the project and undo their detection entirely — the
    // dual-ownership failure the workspace-member walk exists to prevent.
    const { root } = workspace();
    expect(testIncludeRoots(["**/*.test.ts"], root)).toEqual([]);
    expect(detectEcosystemPackages(root, [], testIncludeRoots(["**/*.test.ts"], root))).toContain(
      "@w/lib",
    );
  });

  it("reads the literal directory out of an include glob", () => {
    expect(testIncludeRoots(["packages/ui/src/**/*.test.ts"], "/repo")).toEqual([
      path.resolve("/repo", "packages/ui/src"),
    ]);
    expect(testIncludeRoots(["packages/ui/__tests__/*.ts"], "/repo")).toEqual([
      path.resolve("/repo", "packages/ui/__tests__"),
    ]);
    // Nothing above the root, an exclusion, and a non-list all say nothing.
    expect(testIncludeRoots(["*.test.ts"], "/repo")).toEqual([]);
    expect(testIncludeRoots(["/*.test.ts"], "/repo")).toEqual([]);
    expect(testIncludeRoots(["!packages/ui/**"], "/repo")).toEqual([]);
    expect(testIncludeRoots(undefined, "/repo")).toEqual([]);
  });

  it("does not mistake a scoped directory for a wildcard", () => {
    // `@`, `!` and `+` only introduce a pattern as part of an extglob. Treating them
    // as wildcards on their own truncated the literal at the scope, naming the whole
    // workspace as the project — which switches detection off for every member of it,
    // the exact opposite of what an include pattern is being read for here.
    expect(testIncludeRoots(["packages/@scope/ui/src/**/*.test.ts"], "/repo")).toEqual([
      path.resolve("/repo", "packages/@scope/ui/src"),
    ]);
    expect(testIncludeRoots(["libs/a+b/src/*.test.ts"], "/repo")).toEqual([
      path.resolve("/repo", "libs/a+b/src"),
    ]);
    // A real extglob still stops the literal where it begins.
    expect(testIncludeRoots(["packages/ui/@(src|lib)/*.test.ts"], "/repo")).toEqual([
      path.resolve("/repo", "packages/ui"),
    ]);
  });

  it("never claims React, however a package declares it", () => {
    // A package declaring `react` as a runtime dependency — rather than the peer
    // dependency it should be — puts it in the closure walk, and React would then be
    // externalized and Babel-compiled as if it were untranspiled React Native source.
    // React is the package the engine is least willing to have two of.
    const { root, app } = workspace();
    write(root, "packages/lib/package.json", {
      name: "@w/lib",
      version: "1.0.0",
      dependencies: { react: "19.0.0" },
      peerDependencies: { "react-native": "*" },
    });
    installInto(app, "@w/lib", {
      name: "@w/lib",
      version: "1.0.0",
      dependencies: { react: "19.0.0" },
      peerDependencies: { "react-native": "*" },
    });
    installInto(app, "react", { name: "react", version: "19.0.0" });
    const detected = detectEcosystemPackages(app);
    expect(detected).toContain("@w/lib");
    expect(detected).not.toContain("react");
  });

  it("does not let a sibling's dependency closure pull the package back in", () => {
    // `@w/app` is detected in its own right and depends on `@w/lib`, so
    // the closure walk reaches it by a second route.
    const { root, lib } = workspace();
    write(root, "package.json", {
      name: "w",
      private: true,
      workspaces: ["packages/*"],
      dependencies: { "@w/app": "workspace:*" },
    });
    installInto(root, "@w/app", {
      name: "@w/app",
      version: "1.0.0",
      dependencies: { "@w/lib": "workspace:*" },
      peerDependencies: { "react-native": "*" },
    });
    installInto(root, "@w/lib", {
      name: "@w/lib",
      version: "1.0.0",
      peerDependencies: { "react-native": "*" },
    });
    const detected = detectEcosystemPackages(lib);
    expect(detected).toContain("@w/app");
    expect(detected).not.toContain("@w/lib");
  });
});

describe("test entries are never externalized", () => {
  const inlinePatterns = (): RegExp[] => {
    const config = nativeEngineConfig("/setup.mjs", {}, [".js"]);
    // Defaulted rather than asserted so that removing the rule fails the case that
    // needs it, and leaves the two negative cases passing for the right reason.
    return (config.test.server.deps.inline ?? []) as RegExp[];
  };
  const inlines = (file: string) => inlinePatterns().some((re) => re.test(file));

  it("inlines a first-party test file", () => {
    // A detected workspace library can be the very package whose tests are running —
    // an Nx-style run from the repository root collects them from inside it. Its
    // directory is legitimately externalized, so the entry has to be rescued by name.
    // `inline` is checked before `external`, which is what makes this work.
    expect(inlines("/repo/packages/ui/src/button.test.tsx")).toBe(true);
    expect(inlines("/repo/packages/ui/src/button.spec.ts")).toBe(true);
  });

  it("leaves test files shipped inside installed packages alone", () => {
    // Not an entry, and nothing imports it — externalizing it is correct.
    expect(inlines("/repo/node_modules/some-lib/dist/index.test.js")).toBe(false);
  });

  it("inlines files in a __tests__ directory, whatever they are called", () => {
    // The other convention runners use. A project whose `test.include` points at
    // `__tests__/*.ts` has entries that no filename rule based on `.test.` would
    // catch, and they failed the same way.
    expect(inlines("/repo/packages/ui/__tests__/button.ts")).toBe(true);
    expect(inlines("/repo/packages/ui/__tests__/nested/button.tsx")).toBe(true);
  });

  it("leaves ordinary source files alone", () => {
    expect(inlines("/repo/packages/ui/src/button.tsx")).toBe(false);
  });

  it("adds nothing when the project already inlines everything", () => {
    // `deps.inline: true` is a valid Vitest setting. Merging a pattern list into it
    // yields an array holding `true`, which Vitest calls `.test()` on:
    // "ex.test is not a function", and no tests run at all.
    const config = nativeEngineConfig(
      "/setup.mjs",
      {},
      [".js"],
      [],
      undefined,
      undefined,
      undefined,
      [],
      "/repo",
      true,
    );
    expect(config.test.server.deps).not.toHaveProperty("inline");
  });
});

describe("the project's own directory is never an externalization anchor", () => {
  /**
   * A package that resolves to its own directory.
   *
   * Uses Node's own self-reference — a package with an `exports` map can resolve
   * itself by name — rather than a link back into its own directory. That is the
   * mechanism a real project hits by more than one route (pnpm also links every
   * workspace member into a directory it puts on NODE_PATH), and it needs no
   * symlink, which keeps the fixture identical on every platform.
   */
  function selfResolvingPackage(): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-anchor-")));
    made.push(root);
    write(root, "package.json", {
      name: "@w/self",
      version: "1.0.0",
      exports: { ".": "./index.js", "./package.json": "./package.json" },
    });
    return root;
  }

  const externals = (root: string, transformPkgs: string[]): RegExp[] =>
    nativeEngineConfig(
      "/setup.mjs",
      {},
      [".js"],
      transformPkgs,
      undefined,
      undefined,
      undefined,
      [],
      root,
    ).test.server.deps.external as RegExp[];

  /**
   * The resolved-directory anchors among the patterns, identified by their `^` —
   * the `node_modules/<name>/` rule is unanchored, and matches anywhere in a path.
   *
   * Asserted by shape rather than by testing a path against them, because the
   * patterns hold forward slashes (the form Vitest presents ids in) while
   * `path.join` produces backslashes on Windows. A probe built the second way makes
   * the negative case below pass for the wrong reason — the anchor is present and
   * merely fails to match on separators — which is exactly how the first version of
   * this test came out green locally and red on Windows.
   */
  const directoryAnchors = (root: string, transformPkgs: string[]) =>
    externals(root, transformPkgs).filter((re) => re.source.startsWith("^"));

  it("skips the directory anchor when `transform` names the project's own package", () => {
    // `transform: [...]` names packages by hand and never passes through detection,
    // so the guard there does not help. A migrated Jest `transformIgnorePatterns`
    // list can easily name the project's own package, and the result was that its
    // whole source tree — test files included — was handed to Node and compiled to
    // CommonJS.
    const root = selfResolvingPackage();
    expect(directoryAnchors(root, ["@w/self"])).toEqual([]);
  });

  it("still anchors on the directory of a package that is not the project", () => {
    // The discriminating half: dropping the anchor unconditionally would undo what it
    // is for — matching workspace and `file:` links, which have no node_modules
    // segment to anchor on at all.
    const root = selfResolvingPackage();
    write(root, "node_modules/@w/other/package.json", { name: "@w/other", version: "1.0.0" });
    const anchors = directoryAnchors(root, ["@w/other"]);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].test(`${root.replace(/\\/g, "/")}/node_modules/@w/other/src/index.ts`)).toBe(
      true,
    );
  });
});

describe("detection and disabled presets", () => {
  // A preset package used to be skipped by detection UNCONDITIONALLY, so turning the
  // preset off (`presets: { navigation: false }` — required to run real
  // @react-navigation/* under the native engine, which expo-router needs) un-shadowed
  // the package but left it undetected: nothing compiled its untranspiled lib/module
  // ESM and it failed at load. A package whose preset is off must detect like any
  // other React Native dependency; one whose preset is ON must stay excluded.
  it("detects a preset package when its preset is not active, and skips it when it is", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-preset-off-")));
    made.push(root);
    write(root, "package.json", {
      name: "app",
      private: true,
      dependencies: { "@react-navigation/native": "7.0.0", "react-native": "0.86.0" },
    });
    installInto(root, "@react-navigation/native", {
      name: "@react-navigation/native",
      version: "7.0.0",
      main: "lib/module/index.js",
      peerDependencies: { "react-native": "*" },
    });
    write(root, "node_modules/@react-navigation/native/lib/module/index.js", "export const x = 1;");
    installInto(root, "react-native", { name: "react-native", version: "0.86.0" });

    // navigation preset active → shadowed, not detected
    expect(detectEcosystemPackages(root, [], [], [], ["navigation"])).not.toContain(
      "@react-navigation/native",
    );
    // navigation preset off → an ordinary RN dependency, detected
    expect(detectEcosystemPackages(root, [], [], [], [])).toContain("@react-navigation/native");
    // No active-set passed at all → the pre-existing behaviour (all preset packages
    // treated as shadowed), so older callers are unaffected
    expect(detectEcosystemPackages(root)).not.toContain("@react-navigation/native");
  });
});
