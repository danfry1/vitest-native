/**
 * Detection reads manifests: a package is React Native ecosystem code when its own
 * manifest declares `react-native`. That misses a whole class, and the miss is silent.
 *
 * react-native-modal is the case. It is detected, and importing it still failed with a
 * bare `SyntaxError: Unexpected token '<'` naming no file, because the untranspiled
 * JSX is in react-native-animatable — its dependency, which is transitive (so nothing
 * in the project declares it) and declares `react-native` in neither dependencies nor
 * peerDependencies (so the manifest test rejects it). `transform: ['react-native-modal']`,
 * the documented remedy, does not help.
 *
 * A detected package's dependency closure is the signal its members' own manifests do
 * not carry. React Native's own dependencies are excluded from it: the precompiled
 * registry reaches those through a pre-resolved absolute path, so Node owns them, and
 * inlining one into Vite as well would give the same package two owners.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

type Pkg = { deps?: string[]; peerDeps?: string[] };

/** A project root with `installed` packages, and the project depending on `declares`. */
function project(declares: string[], installed: Record<string, Pkg>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-closure-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "app",
      dependencies: Object.fromEntries(declares.map((d) => [d, "*"])),
    }),
  );
  for (const [name, pkg] of Object.entries(installed)) {
    const dir = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        main: "index.js",
        ...(pkg.deps ? { dependencies: Object.fromEntries(pkg.deps.map((d) => [d, "*"])) } : {}),
        ...(pkg.peerDeps
          ? { peerDependencies: Object.fromEntries(pkg.peerDeps.map((d) => [d, "*"])) }
          : {}),
      }),
    );
    fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};");
  }
  return root;
}

describe("ecosystem detection: dependency closure", () => {
  it("detects a package that declares react-native itself", () => {
    // Control: the behaviour the closure walk builds on. If this ever fails, the
    // assertions below are testing nothing.
    const root = project(["rn-lib"], {
      "react-native": {},
      "rn-lib": { peerDeps: ["react-native"] },
    });
    expect(detectEcosystemPackages(root)).toContain("rn-lib");
  });

  it("includes a transitive dependency that declares no react-native", () => {
    const root = project(["rn-lib"], {
      "react-native": {},
      "rn-lib": { peerDeps: ["react-native"], deps: ["untranspiled-dep"] },
      // The react-native-animatable shape: nothing declares it, and it names
      // react-native nowhere.
      "untranspiled-dep": {},
    });
    expect(detectEcosystemPackages(root)).toContain("untranspiled-dep");
  });

  it("follows the closure deeper than one level", () => {
    const root = project(["rn-lib"], {
      "react-native": {},
      "rn-lib": { peerDeps: ["react-native"], deps: ["mid"] },
      mid: { deps: ["leaf"] },
      leaf: {},
    });
    expect(detectEcosystemPackages(root)).toEqual(expect.arrayContaining(["mid", "leaf"]));
  });

  it("excludes React Native's own dependencies, which the registry owns", () => {
    const root = project(["rn-lib"], {
      // `invariant` is reached both ways: React Native depends on it, and so does
      // the detected package. Node owns it; inlining it would make two instances.
      "react-native": { deps: ["invariant"] },
      "rn-lib": { peerDeps: ["react-native"], deps: ["invariant", "safe-dep"] },
      invariant: {},
      "safe-dep": {},
    });
    const detected = detectEcosystemPackages(root);
    expect(detected).not.toContain("invariant");
    expect(detected).toContain("safe-dep");
  });

  it("does not reach a package that nothing in the closure depends on", () => {
    const root = project(["rn-lib", "unrelated"], {
      "react-native": {},
      "rn-lib": { peerDeps: ["react-native"] },
      unrelated: {},
    });
    expect(detectEcosystemPackages(root)).not.toContain("unrelated");
  });

  it("ignores a declared dependency that is not installed", () => {
    const root = project(["rn-lib"], {
      "react-native": {},
      "rn-lib": { peerDeps: ["react-native"], deps: ["absent-dep"] },
    });
    expect(detectEcosystemPackages(root)).not.toContain("absent-dep");
  });

  it("terminates on a dependency cycle", () => {
    const root = project(["rn-lib"], {
      "react-native": {},
      "rn-lib": { peerDeps: ["react-native"], deps: ["a"] },
      a: { deps: ["b"] },
      b: { deps: ["a"] },
    });
    expect(detectEcosystemPackages(root)).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("excludes the transform's own toolchain closure", () => {
    // @babel/core is what the transform runs. Inlining anything Babel reaches means
    // loading it re-enters the transform while Babel is mid-load. `expo` declares
    // @babel/core as a runtime dependency, which is how the closure reached it and
    // then its own dependencies — two separate blow-ups in the packed Expo consumer,
    // neither reproducible in a synthetic fixture until this test.
    const root = project(["rn-lib"], {
      "react-native": {},
      "rn-lib": { peerDeps: ["react-native"], deps: ["@babel/core", "safe-dep"] },
      "@babel/core": { deps: ["babel-helper"] },
      "babel-helper": {},
      "safe-dep": {},
    });
    const detected = detectEcosystemPackages(root);
    expect(detected).not.toContain("@babel/core");
    expect(detected, "a package Babel itself depends on").not.toContain("babel-helper");
    expect(detected).toContain("safe-dep");
  });
});

/**
 * The closure walk starts only from what the RUN declares.
 *
 * Collecting candidates across every workspace manifest is what finds a library the
 * application depends on. Walking closures from all of them is a different matter: a
 * sibling Expo application is detected on its own manifest, and its dependencies are
 * the Expo and Metro toolchain — several hundred packages, `@babel/runtime` and
 * Metro's `lru-cache` chain among them. Compiling those with the React Native Babel
 * preset is both pointless for a library that depends on none of them, and actively
 * fatal: React Native and Babel load them, and transforming the transform's own
 * toolchain re-enters Babel while it is initialising.
 *
 * Reported against 0.11.0: in a workspace holding a library and an Expo application —
 * the canonical React Native monorepo — the application's presence alone stopped the
 * library's tests from loading.
 */
describe("ecosystem detection: whose closure gets walked", () => {
  /** A workspace whose sibling declares `heavy-app`, and whose project declares none. */
  function workspaceWithSibling(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-sibling-"));
    roots.push(root);
    const write = (rel: string, value: unknown) => {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value));
    };
    write("package.json", { name: "w", private: true, workspaces: ["packages/*"] });
    write("packages/lib/package.json", {
      name: "@w/lib",
      dependencies: { "rn-widget": "*" },
    });
    write("packages/app/package.json", {
      name: "@w/app",
      dependencies: { "heavy-app": "*" },
    });
    // Installed where both members can resolve them.
    write("node_modules/rn-widget/package.json", {
      name: "rn-widget",
      peerDependencies: { "react-native": "*" },
      dependencies: { "widget-internals": "*" },
    });
    write("node_modules/widget-internals/package.json", { name: "widget-internals" });
    write("node_modules/heavy-app/package.json", {
      name: "heavy-app",
      peerDependencies: { "react-native": "*" },
      dependencies: { "toolchain-helpers": "*" },
    });
    write("node_modules/toolchain-helpers/package.json", { name: "toolchain-helpers" });
    return root;
  }

  it("does not walk the closure of a package only a sibling declares", () => {
    const detected = detectEcosystemPackages(path.join(workspaceWithSibling(), "packages", "lib"));
    expect(detected).not.toContain("toolchain-helpers");
  });

  it("still walks the closure of a package the project declares", () => {
    // The discriminating half: this is what the closure walk exists for, and the
    // filter must not cost it.
    const detected = detectEcosystemPackages(path.join(workspaceWithSibling(), "packages", "lib"));
    expect(detected).toContain("rn-widget");
    expect(detected).toContain("widget-internals");
  });

  it("still walks a closure declared by a manifest above the project", () => {
    // A workspace that keeps its React Native libraries at the repository root is a
    // documented layout; those manifests belong to the run just as the project's own
    // does.
    const root = workspaceWithSibling();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "w",
        private: true,
        workspaces: ["packages/*"],
        dependencies: { "heavy-app": "*" },
      }),
    );
    const detected = detectEcosystemPackages(path.join(root, "packages", "lib"));
    expect(detected).toContain("toolchain-helpers");
  });
});
