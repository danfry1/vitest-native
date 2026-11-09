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
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { serializableAliases } from "../src/jest-compat/aliases.mjs";
import { aliasReachedPaths, detectEcosystemPackages } from "../src/native/ecosystem.js";
import { dependencyDirOf } from "../src/native/match.mjs";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

// `fields`: other manifest fields, where a helper writes them (the workspace helper).
type Pkg = {
  deps?: string[];
  peerDeps?: string[];
  fields?: Record<string, unknown>;
  /** index.js; module.exports = {} when absent. */
  source?: string;
};

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

  it("excludes Babel's emitted helpers and Metro, which @babel/core does not reach", () => {
    // The gap that broke 0.11.0 for Expo projects. `@babel/runtime` holds the helpers
    // Babel EMITS, so compiled output across the ecosystem — React Native's included —
    // requires it at run time; Metro is the bundler the preset belongs to, and its
    // lru-cache chain is loaded the same way. Neither is reachable from `@babel/core`,
    // so the original exclusion let both through, and compiling them re-entered Babel
    // while it was initialising.
    const root = project(["expo-ish"], {
      "react-native": {},
      "expo-ish": { peerDeps: ["react-native"], deps: ["@babel/runtime", "metro", "safe-dep"] },
      "@babel/runtime": { deps: ["regenerator-ish"] },
      "regenerator-ish": {},
      metro: { deps: ["lru-cache-ish"] },
      "lru-cache-ish": { deps: ["yallist-ish"] },
      "yallist-ish": {},
      "safe-dep": {},
    });
    const detected = detectEcosystemPackages(root);
    expect(detected).not.toContain("@babel/runtime");
    expect(detected, "a package Babel's helpers depend on").not.toContain("regenerator-ish");
    expect(detected).not.toContain("metro");
    expect(detected, "Metro's cache chain, how yallist arrived").not.toContain("yallist-ish");
    // The rest of the package's closure is still compiled — the exclusion is scoped
    // to the toolchain, not to everything a toolchain-using package depends on.
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
describe("ecosystem detection: an ESM-only closure member", () => {
  /** `project()` cannot express `type`/`exports`, so this writes the manifests. */
  function withEsmDependency(extra: Record<string, unknown>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-esm-"));
    roots.push(root);
    const write = (name: string, manifest: Record<string, unknown>) => {
      const dir = path.join(root, "node_modules", ...name.split("/"));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, ...manifest }));
    };
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "app", dependencies: { "rn-lib": "*" } }),
    );
    write("react-native", {});
    write("rn-lib", {
      peerDependencies: { "react-native": "*" },
      dependencies: { "esm-dep": "*" },
    });
    write("esm-dep", extra);
    return root;
  }

  it("is not compiled: it publishes runnable ES modules and nothing React Native", () => {
    // The closure walk is a guess that a dependency might be untranspiled React Native
    // source. `"type": "module"` is the manifest saying the opposite. Compiling it
    // anyway rewrites a package that publishes ESM into CommonJS and hands it to Node
    // under that format — how `zod`, reached exactly this way, took fourteen files down.
    const detected = detectEcosystemPackages(withEsmDependency({ type: "module" }));
    expect(detected).toContain("rn-lib");
    expect(detected).not.toContain("esm-dep");
  });

  it("is still compiled when it declares a React Native build", () => {
    // The discriminating half. A genuine React Native library may well be `type:
    // module` and still ship source the preset has to compile; the React Native build
    // is what says so — by legacy field...
    const byField = detectEcosystemPackages(
      withEsmDependency({ type: "module", "react-native": "./native.js" }),
    );
    expect(byField).toContain("esm-dep");
    // ...or by export condition, at any depth of the map.
    const byCondition = detectEcosystemPackages(
      withEsmDependency({
        type: "module",
        exports: {
          ".": { "react-native": { default: "./native.js" }, import: "./index.js" },
          // Without this the manifest cannot be read at all and the package is
          // skipped as "declared but not installed" — which would make the
          // assertion below pass for entirely the wrong reason.
          "./package.json": "./package.json",
        },
      }),
    );
    expect(byCondition).toContain("esm-dep");
  });

  it("is still compiled when it is CommonJS, which says nothing either way", () => {
    expect(detectEcosystemPackages(withEsmDependency({}))).toContain("esm-dep");
  });
});

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

/**
 * A React Native workspace package that imports a workspace library without declaring
 * it (#692). Node loads the library through the package's source, so it belongs to the
 * closure (ADR-0004 rule 7) as a declared one does; left out, Vite evaluated it for the
 * test's own import and the two copies kept separate state. Only unconditional,
 * top-level imports count, read with the project's Babel parser.
 */
describe("ecosystem detection: a workspace member imported but not declared", () => {
  type Options = {
    /** packages/feature's own files, by path below it; src/index.ts is its entry. */
    files: Record<string, string>;
    feature?: Record<string, unknown>;
    lib?: Record<string, unknown>;
    /** Where the workspace links live: hoisted (node_modules) or per member (pnpm). */
    layout?: "hoisted" | "pnpm";
  };
  function workspace({ files, feature = {}, lib = {}, layout = "hoisted" }: Options): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-undeclared-"));
    roots.push(root);
    const write = (rel: string, value: unknown) => {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
    };
    write("package.json", { name: "w", private: true, workspaces: ["packages/*", "apps/*"] });
    write("apps/app/package.json", { name: "@w/app", dependencies: { "@w/feature": "*" } });
    write("packages/feature/package.json", {
      name: "@w/feature",
      main: "src/index.ts",
      peerDependencies: { "react-native": "*" },
      ...feature,
    });
    for (const [rel, code] of Object.entries(files)) write(`packages/feature/${rel}`, code);
    write("packages/lib/package.json", { name: "@w/lib", main: "src/index.ts", ...lib });
    write("packages/lib/src/index.ts", "export const store = { value: null };\n");
    write("packages/unused/package.json", { name: "@w/unused", main: "index.js" });
    write("node_modules/plain-installed/package.json", { name: "plain-installed" });
    // The workspace's links, as an install makes them: hoisted to the root, or (pnpm)
    // only into the package that declares each one, here the app.
    const linksAt = layout === "hoisted" ? "node_modules" : "apps/app/node_modules";
    const links =
      layout === "hoisted"
        ? [
            ["@w/feature", "packages/feature"],
            ["@w/lib", "packages/lib"],
            ["@w/unused", "packages/unused"],
          ]
        : [
            ["@w/feature", "packages/feature"],
            ["@w/lib", "packages/lib"],
          ];
    for (const [name, dir] of links) {
      const link = path.join(root, linksAt, ...name.split("/"));
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(path.join(root, dir), link, "dir");
    }
    return path.join(root, "apps", "app");
  }
  const detect = (app: string, reported: string[] = [], truncated: string[] = []) =>
    detectEcosystemPackages(app, [], [], [], undefined, dependencyDirOf, {
      onImportedUndeclared: (importer, name, _dir, listed) =>
        reported.push(`${importer} imports ${name} (${listed})`),
      onImportScanTruncated: (pkg, limit) => truncated.push(`${pkg} ${limit}`),
    });

  it("joins the closure of the package that imports it, and is reported", () => {
    const reported: string[] = [];
    const detected = detect(
      workspace({
        files: {
          "src/index.ts":
            'import { store } from "@w/lib";\nimport "plain-installed";\nexport { store };\n',
        },
      }),
      reported,
    );
    expect(detected).toContain("@w/feature");
    expect(detected).toContain("@w/lib");
    expect(reported).toEqual(["@w/feature imports @w/lib (undeclared)"]);
    // An installed package's undeclared import is not this edge's business, and a member
    // nothing imports stays out.
    expect(detected).not.toContain("plain-installed");
    expect(detected).not.toContain("@w/unused");
  });

  it("counts a top-level require and a re-export, and follows relative imports", () => {
    for (const files of [
      { "src/index.ts": 'const { store } = require("@w/lib");\nexport { store };\n' },
      { "src/index.ts": 'export { store } from "@w/lib";\n' },
      { "src/index.ts": 'export * from "./inner";\n', "src/inner.ts": 'export * from "@w/lib";\n' },
    ]) {
      expect(detect(workspace({ files })), JSON.stringify(files)).toContain("@w/lib");
    }
  });

  it("does not count a conditional require, a string, a comment or a type-only import", () => {
    // Each would have joined the closure under a text scan; a parse sees none of them as
    // an unconditional import. The control above is the same workspace with a real one.
    for (const code of [
      'declare const __DEV__: boolean;\nif (__DEV__) require("@w/lib");\nexport {};\n',
      'export const sample = `import { store } from "@w/lib"`;\n',
      '// import { store } from "@w/lib";\nexport {};\n',
      'export function load() {\n  return require("@w/lib");\n}\n',
      'import type { Store } from "@w/lib";\nexport type { Store };\n',
      'import { type Store } from "@w/lib";\nexport type { Store };\n',
    ]) {
      const detected = detect(workspace({ files: { "src/index.ts": code } }));
      expect(detected, code).toContain("@w/feature");
      expect(detected, code).not.toContain("@w/lib");
    }
  });

  it("reads every exports subpath, not only the root", () => {
    const detected = detect(
      workspace({
        feature: {
          exports: {
            ".": "./src/index.ts",
            "./native": "./src/native.ts",
            // A workspace member is found through its manifest request (dependencyDirOf).
            "./package.json": "./package.json",
          },
        },
        files: {
          "src/index.ts": "export const root = 1;\n",
          "src/native.ts": 'export { store } from "@w/lib";\n',
        },
      }),
    );
    expect(detected).toContain("@w/lib");
  });

  it("applies the gate a declared dependency passes: an ES-module-only member stays out", () => {
    // Declaring the dependency must not change the member's owner, so both edges agree.
    const esmOnly = {
      type: "module",
      main: "src/index.js",
      exports: { ".": "./src/index.js", "./package.json": "./package.json" },
    };
    const files = { "src/index.ts": 'import { store } from "@w/lib";\nexport { store };\n' };
    const undeclared = detect(workspace({ files, lib: esmOnly }));
    const declared = detect(
      workspace({ files, lib: esmOnly, feature: { dependencies: { "@w/lib": "*" } } }),
    );
    expect(undeclared.includes("@w/lib")).toBe(declared.includes("@w/lib"));
    expect(undeclared).not.toContain("@w/lib");
  });

  it("says when the library is listed only in devDependencies", () => {
    const reported: string[] = [];
    detect(
      workspace({
        feature: { devDependencies: { "@w/lib": "*" } },
        files: { "src/index.ts": 'export { store } from "@w/lib";\n' },
      }),
      reported,
    );
    expect(reported).toEqual(["@w/feature imports @w/lib (devDependency)"]);
  });

  it("names a scan the file limit cut short", () => {
    const files: Record<string, string> = {};
    const imports: string[] = [];
    for (let i = 0; i < 5001; i++) {
      files[`src/f${i}.ts`] = "export {};\n";
      imports.push(`import "./f${i}";`);
    }
    files["src/index.ts"] = `${imports.join("\n")}\n`;
    const truncated: string[] = [];
    detect(workspace({ files }), [], truncated);
    expect(truncated).toEqual(["@w/feature 5000"]);
  });

  it("does nothing under pnpm's layout, where Node cannot resolve the member from the package either", () => {
    // pnpm links a workspace member only into the packages that declare it. @w/feature
    // does not, so `@w/lib` resolves from neither the scan nor Node's require from
    // feature's source: Node fails to load it there, so there is no second copy to avoid.
    // Out of scope for this edge; the require's own error names the missing package.
    const app = workspace({
      layout: "pnpm",
      files: { "src/index.ts": 'export { store } from "@w/lib";\n' },
    });
    const detected = detect(app);
    expect(detected).toContain("@w/feature");
    expect(detected).not.toContain("@w/lib");
    expect(() =>
      createRequire(path.join(app, "..", "..", "packages", "feature", "src", "index.ts")).resolve(
        "@w/lib",
      ),
    ).toThrow();
  });
});

/**
 * An isolated install (pnpm, bun) links only the project's direct dependencies into
 * its node_modules. Each package's real directory sits in a store, with its own
 * dependencies linked beside it, so a transitive dependency resolves from the package
 * that declares it and from nowhere above the project.
 *
 * The walk used to resolve every member from the project root. Under this layout it
 * found no transitive dependency at all: with the navigation preset off,
 * @react-navigation/elements (a dependency of native-stack) was left uncompiled and
 * failed at import against the compiled @react-navigation/native ("does not provide an
 * export named 'useTheme'"). A hoisted layout hid it, because there everything
 * resolves from the root.
 */
describe("ecosystem detection: an isolated install layout", () => {
  /**
   * `<root>/node_modules/.store/<name>/node_modules/<name>` holds each package, with
   * its dependencies linked beside it; only `declares` are linked into the root.
   * `hoisted` are also linked into `node_modules/.store/node_modules`, where pnpm's
   * `node_modules/.pnpm/node_modules` makes every package resolvable from inside the
   * store but not from the project.
   */
  function isolated(
    declares: string[],
    installed: Record<string, Pkg>,
    hoisted: string[] = [],
    { linkPeers = false }: { linkPeers?: boolean } = {},
  ): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-isolated-"));
    roots.push(root);
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "app",
        dependencies: Object.fromEntries(declares.map((d) => [d, "*"])),
      }),
    );
    const storeDir = (name: string) =>
      path.join(root, "node_modules", ".store", name.replace("/", "+"), "node_modules", name);
    const link = (target: string, at: string) => {
      fs.mkdirSync(path.dirname(at), { recursive: true });
      // A junction on Windows, which needs no privilege; ignored elsewhere.
      fs.symlinkSync(target, at, "junction");
    };
    for (const [name, pkg] of Object.entries(installed)) {
      const dir = storeDir(name);
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
          ...pkg.fields,
        }),
      );
      fs.writeFileSync(path.join(dir, "index.js"), pkg.source ?? "module.exports = {};");
    }
    for (const [name, pkg] of Object.entries(installed)) {
      // The store's node_modules that holds `name`: its dependencies go beside it.
      const modules = path.dirname(storeDir(name)).replace(/[\\/]@[^\\/]+$/, "");
      // pnpm links an installed peer beside the package too (an auto-installed peer).
      for (const dep of [...(pkg.deps ?? []), ...(linkPeers ? (pkg.peerDeps ?? []) : [])]) {
        if (dep in installed) link(storeDir(dep), path.join(modules, ...dep.split("/")));
      }
    }
    for (const name of declares) {
      link(storeDir(name), path.join(root, "node_modules", ...name.split("/")));
    }
    for (const name of hoisted) {
      link(storeDir(name), path.join(root, "node_modules", ".store", "node_modules", name));
    }
    return root;
  }

  const navigationLike = () =>
    isolated(["react-native", "@nav/native", "@nav/native-stack"], {
      "react-native": {},
      "@nav/native": { peerDeps: ["react-native"], deps: ["@nav/core"] },
      "@nav/native-stack": { peerDeps: ["react-native"], deps: ["@nav/elements"] },
      // Neither is linked into the project; each resolves only from its parent.
      "@nav/elements": { deps: ["@nav/core"] },
      "@nav/core": { deps: ["deep-helper"] },
      "deep-helper": {},
    });

  // #508: pnpm installs a required peer itself, so a package can reach one nobody
  // declares. expo-router (compiled) requires expo-linking, its auto-installed peer; left
  // uncompiled, its published ES module build was loaded by both module systems.
  const routerLike = (linkingPeer: Pkg = { peerDeps: ["react-native"] }, linked = true) =>
    isolated(
      ["react-native", "router-ish"],
      {
        "react-native": {},
        "router-ish": {
          peerDeps: ["react-native", "linking-ish"],
          deps: ["router-core"],
          source: 'module.exports = require("linking-ish");',
        },
        "router-core": {},
        "linking-ish": linkingPeer,
      },
      [],
      { linkPeers: linked },
    );

  it("compiles a required React Native peer nothing declares, installed beside its package", () => {
    const detected = detectEcosystemPackages(routerLike());
    expect(detected).toContain("router-ish");
    expect(detected).toContain("linking-ish");
  });

  it("does not follow an optional peer", () => {
    const root = isolated(
      ["react-native", "router-ish"],
      {
        "react-native": {},
        "router-ish": {
          peerDeps: ["react-native", "linking-ish"],
          fields: { peerDependenciesMeta: { "linking-ish": { optional: true } } },
          source: 'module.exports = require("linking-ish");',
        },
        "linking-ish": { peerDeps: ["react-native"] },
      },
      [],
      { linkPeers: true },
    );
    expect(detectEcosystemPackages(root)).not.toContain("linking-ish");
  });

  it("does not follow a required peer that is not React Native", () => {
    expect(detectEcosystemPackages(routerLike({}))).not.toContain("linking-ish");
  });

  it("does not follow a required React Native peer the package's files never load", () => {
    // expo-constants' shape: `expo` is a required peer, and nothing in it loads expo.
    const root = isolated(
      ["react-native", "constants-ish"],
      {
        "react-native": {},
        "constants-ish": { peerDeps: ["react-native", "expo-ish"] },
        "expo-ish": { peerDeps: ["react-native"] },
      },
      [],
      { linkPeers: true },
    );
    expect(detectEcosystemPackages(root)).not.toContain("expo-ish");
  });

  it("does not count a peer named only outside the package's runtime files", () => {
    // expo-constants' real shape: its config plugin and scripts require `expo/config`, and
    // its sources import a type from it; its runtime build never loads expo.
    const root = isolated(
      ["react-native", "constants-ish"],
      {
        "react-native": {},
        "constants-ish": {
          peerDeps: ["react-native", "expo-ish"],
          fields: { main: "build/index.js" },
          source: 'require("expo-ish/config");',
        },
        "expo-ish": { peerDeps: ["react-native"] },
      },
      [],
      { linkPeers: true },
    );
    const store = path.join(
      root,
      "node_modules",
      ".store",
      "constants-ish",
      "node_modules",
      "constants-ish",
    );
    fs.mkdirSync(path.join(store, "build"), { recursive: true });
    fs.writeFileSync(
      path.join(store, "build", "index.js"),
      [
        'import type { Config } from "expo-ish/config";',
        '// require("expo-ish") is how the config plugin reaches it',
        'export const version = "1";',
      ].join("\n"),
    );
    expect(detectEcosystemPackages(root)).not.toContain("expo-ish");
  });

  it("does not follow a peer that is not installed beside its package", () => {
    expect(detectEcosystemPackages(routerLike(undefined, false))).not.toContain("linking-ish");
  });

  it("resolves no transitive dependency from the project root (the layout's premise)", () => {
    // Control: if these resolved from the root, the layout would be hoisted and the
    // assertions below would not distinguish the fix.
    const root = navigationLike();
    const req = createRequire(path.join(root, "package.json"));
    expect(() => req.resolve("@nav/native/package.json")).not.toThrow();
    for (const name of ["@nav/elements", "@nav/core", "deep-helper"]) {
      expect(() => req.resolve(`${name}/package.json`)).toThrow();
    }
  });

  it("includes transitive dependencies resolved from the package that declares them", () => {
    const detected = detectEcosystemPackages(navigationLike());
    expect(detected).toEqual(
      expect.arrayContaining(["@nav/native", "@nav/native-stack", "@nav/elements", "@nav/core"]),
    );
  });

  it("follows the closure through more than one store directory", () => {
    expect(detectEcosystemPackages(navigationLike())).toContain("deep-helper");
  });

  it("still ignores a dependency that is installed nowhere", () => {
    const root = isolated(["react-native", "rn-lib"], {
      "react-native": {},
      "rn-lib": { peerDeps: ["react-native"], deps: ["missing-dep"] },
    });
    expect(detectEcosystemPackages(root)).not.toContain("missing-dep");
  });

  it("excludes the toolchain's transitive closure, which resolves only from inside it", () => {
    // The toolchain closure is computed the same way. Resolved from the root, it
    // stopped at @babel/core's direct dependencies, so a deeper Babel dependency
    // reached through a detected package would have been compiled with Babel.
    const root = isolated(["react-native", "@babel/core", "rn-lib"], {
      "react-native": {},
      "@babel/core": { deps: ["babel-generator"] },
      "babel-generator": { deps: ["babel-internal"] },
      "babel-internal": {},
      "rn-lib": { peerDeps: ["react-native"], deps: ["babel-internal"] },
    });
    expect(detectEcosystemPackages(root)).not.toContain("babel-internal");
  });

  // pnpm links neither metro nor @babel/runtime into an Expo app, so seeded from the
  // project root they reached nothing, while the walk reached their closures through
  // expo's own dependencies: 244 packages on an Expo 58 app, Metro's chain among them.
  it("seeds Metro from React Native's directory when the project does not link it", () => {
    const root = isolated(
      ["react-native", "expo-ish"],
      {
        "react-native": {},
        metro: { deps: ["metro-config-ish"] },
        "metro-config-ish": {},
        // Expo's Metro configuration depends on Metro's packages directly.
        "expo-ish": { peerDeps: ["react-native"], deps: ["@expo/metro-config-ish"] },
        "@expo/metro-config-ish": { deps: ["metro", "metro-config-ish"] },
      },
      ["metro"],
    );
    const detected = detectEcosystemPackages(root);
    expect(detected).toContain("@expo/metro-config-ish");
    expect(detected).not.toContain("metro-config-ish");
  });

  it("seeds Expo's Babel preset from expo's directory", () => {
    const root = isolated(["react-native", "expo"], {
      "react-native": {},
      expo: {
        peerDeps: ["react-native"],
        deps: ["babel-preset-expo", "expo-asset-ish", "@expo/config-ish"],
      },
      "babel-preset-expo": { deps: ["babel-plugin-ish"] },
      "babel-plugin-ish": {},
      "expo-asset-ish": {},
      // The preset's plugins are reached by other routes through expo too.
      "@expo/config-ish": { deps: ["babel-plugin-ish"] },
    });
    const detected = detectEcosystemPackages(root);
    expect(detected).toContain("expo-asset-ish");
    expect(detected).not.toContain("babel-preset-expo");
    expect(detected).not.toContain("babel-plugin-ish");
  });
});

/**
 * A package detected on a sibling's declaration that the run reaches anyway.
 *
 * In a workspace the app declares `expo`, so `expo` is detected; a library under test
 * declares expo-image, whose peer `expo` is then loaded by the library's tests too. The
 * walk started only from the library's own declarations, and stopped at any package
 * already in the set, so `expo` was compiled and its dependencies were not: under an
 * isolated install expo-asset is expo's dependency and nobody's declaration, and its
 * `build/` ES modules loaded raw ("Cannot find module 'expo-asset/build/Asset.fx'").
 * The layout is isolated here, but what matters is the declaration: a hoisted install
 * leaves expo-asset just as undeclared.
 */
describe("ecosystem detection: a sibling-declared package the run reaches", () => {
  // The native engine's presets: the expo preset is off there, so expo-constants and
  // its siblings run as themselves (an empty set; undefined treats every preset as on).
  const detect = (root: string) => detectEcosystemPackages(root, [], [], [], []);
  type Member = { declares: string[] };
  /**
   * A workspace whose members link `declares` from a store, each package's
   * dependencies and installed peers linked beside it there, as pnpm lays them out.
   */
  function workspace(members: Record<string, Member>, installed: Record<string, Pkg>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-reached-"));
    roots.push(root);
    const write = (file: string, value: unknown) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value));
    };
    const link = (target: string, at: string) => {
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.symlinkSync(target, at, "junction");
    };
    write(path.join(root, "package.json"), {
      name: "w",
      private: true,
      workspaces: ["packages/*"],
    });
    const storeDir = (name: string) =>
      path.join(root, "node_modules", ".pnpm", name.replace("/", "+"), "node_modules", name);
    for (const [name, pkg] of Object.entries(installed)) {
      write(path.join(storeDir(name), "package.json"), {
        ...pkg.fields,
        name,
        version: "1.0.0",
        ...(pkg.deps ? { dependencies: Object.fromEntries(pkg.deps.map((d) => [d, "*"])) } : {}),
        ...(pkg.peerDeps
          ? { peerDependencies: Object.fromEntries(pkg.peerDeps.map((d) => [d, "*"])) }
          : {}),
      });
    }
    for (const [name, pkg] of Object.entries(installed)) {
      const beside = path.dirname(storeDir(name)).replace(/[\\/]@[^\\/]+$/, "");
      for (const dep of [...(pkg.deps ?? []), ...(pkg.peerDeps ?? [])]) {
        if (dep in installed) link(storeDir(dep), path.join(beside, ...dep.split("/")));
      }
    }
    for (const [member, { declares }] of Object.entries(members)) {
      const dir = path.join(root, "packages", member);
      write(path.join(dir, "package.json"), {
        name: `@w/${member}`,
        dependencies: Object.fromEntries(declares.map((d) => [d, "*"])),
      });
      for (const name of declares) {
        link(storeDir(name), path.join(dir, "node_modules", ...name.split("/")));
      }
    }
    return root;
  }

  const expoLike: Record<string, Pkg> = {
    "react-native": {},
    expo: { peerDeps: ["react-native"], deps: ["expo-asset", "expo-constants"] },
    // Each declares react-native as a peer, as the real ones do, and is detected on
    // that only where something declares it.
    "expo-asset": { peerDeps: ["expo", "react-native"] },
    "expo-constants": { peerDeps: ["expo", "react-native"], deps: ["constants-helper"] },
    "constants-helper": {},
  };

  it("walks a detected package the run reaches through a peer", () => {
    const root = workspace(
      {
        app: { declares: ["react-native", "expo"] },
        ui: { declares: ["react-native", "expo-image"] },
      },
      { ...expoLike, "expo-image": { peerDeps: ["expo", "react", "react-native"] } },
    );
    const detected = detect(path.join(root, "packages", "ui"));
    expect(detected).toEqual(expect.arrayContaining(["expo-image", "expo"]));
    expect(detected).toEqual(
      expect.arrayContaining(["expo-asset", "expo-constants", "constants-helper"]),
    );
  });

  it("walks a detected package the run reaches through a dependency", () => {
    const root = workspace(
      {
        app: { declares: ["react-native", "expo"] },
        ui: { declares: ["react-native", "design-system"] },
      },
      { ...expoLike, "design-system": { peerDeps: ["react-native"], deps: ["expo"] } },
    );
    const detected = detect(path.join(root, "packages", "ui"));
    expect(detected).toEqual(expect.arrayContaining(["expo-asset", "expo-constants"]));
  });

  it("still does not walk a sibling-declared package the run does not reach", () => {
    const root = workspace(
      {
        app: { declares: ["react-native", "expo"] },
        ui: { declares: ["react-native", "rn-widget"] },
      },
      { ...expoLike, "rn-widget": { peerDeps: ["react-native"] } },
    );
    const detected = detect(path.join(root, "packages", "ui"));
    expect(detected, "detected on the sibling's declaration").toContain("expo");
    expect(detected).not.toContain("expo-asset");
    expect(detected).not.toContain("constants-helper");
  });

  it("walks a detected package that publishes only ES modules", () => {
    // The ES-module test is for packages the closure alone brings in. A detected one is
    // compiled whatever it publishes, and so is its closure.
    const root = workspace(
      {
        app: { declares: ["react-native", "esm-rn-lib"] },
        ui: { declares: ["react-native", "design-system"] },
      },
      {
        "react-native": {},
        "design-system": { peerDeps: ["react-native"], deps: ["esm-rn-lib"] },
        "esm-rn-lib": {
          peerDeps: ["react-native"],
          deps: ["esm-rn-helper"],
          fields: { type: "module" },
        },
        "esm-rn-helper": {},
      },
    );
    expect(detect(path.join(root, "packages", "ui"))).toContain("esm-rn-helper");
  });

  it("does not take a peer edge into React Native's own dependencies", () => {
    // The same exclusions as a dependency edge: the registry owns what React Native
    // depends on, so nothing reached from it is compiled.
    const root = workspace(
      {
        app: { declares: ["react-native", "rn-owned"] },
        ui: { declares: ["react-native", "peer-lib"] },
      },
      {
        "react-native": { deps: ["rn-owned"] },
        "peer-lib": { peerDeps: ["react-native", "rn-owned"] },
        "rn-owned": { peerDeps: ["react-native"], deps: ["rn-owned-child"] },
        "rn-owned-child": {},
      },
    );
    expect(detect(path.join(root, "packages", "ui"))).not.toContain("rn-owned-child");
  });

  it("does not follow an optional peer nobody declares into its closure", () => {
    // An installed optional peer nobody declares (expo-router, which @expo/cli lists as an
    // optional peer, for an app that never imports it) is not added, and neither is its
    // closure. In the real manifests that edge is optional; a required React Native peer
    // installed beside its package is followed (#508, the isolated-install tests).
    const root = workspace(
      { ui: { declares: ["react-native", "expo-image"] } },
      {
        ...expoLike,
        "expo-image": {
          peerDeps: ["expo", "react-native", "router-ish"],
          fields: { peerDependenciesMeta: { "router-ish": { optional: true } } },
        },
        "router-ish": { peerDeps: ["react-native"], deps: ["router-helper"] },
        "router-helper": {},
      },
    );
    const detected = detect(path.join(root, "packages", "ui"));
    expect(detected).not.toContain("router-ish");
    expect(detected).not.toContain("router-helper");
  });
});

describe("ecosystem detection: a package named in transform", () => {
  // react-native-flash-message's shape: a detected package whose dependency,
  // react-native-iphone-screen-helper, is an ES module that imports react-native.
  const flashLike = () =>
    project(["react-native", "flash-ish"], {
      "react-native": {},
      "flash-ish": { peerDeps: ["react-native"], deps: ["screen-helper-ish"] },
      "screen-helper-ish": { peerDeps: ["react-native"], deps: ["helper-dep"] },
      "helper-dep": {},
    });

  it("walks its closure as it walks a detected package's", () => {
    const detected = detectEcosystemPackages(flashLike(), ["flash-ish"]);
    expect(detected).toEqual(expect.arrayContaining(["screen-helper-ish", "helper-dep"]));
  });

  it("leaves the named package itself to the transform option", () => {
    expect(detectEcosystemPackages(flashLike(), ["flash-ish"])).not.toContain("flash-ish");
  });

  it("does not walk a named package an active preset shadows", () => {
    // @gorhom/bottom-sheet, named in transform and shadowed by its preset: its real source
    // never loads, so @gorhom/portal is not handed to Node.
    const root = project(["react-native", "@gorhom/bottom-sheet"], {
      "react-native": {},
      "@gorhom/bottom-sheet": { peerDeps: ["react-native"], deps: ["@gorhom/portal"] },
      "@gorhom/portal": {},
    });
    const named = ["@gorhom/bottom-sheet"];
    expect(detectEcosystemPackages(root, named, [], [], ["bottomSheet"])).not.toContain(
      "@gorhom/portal",
    );
    // With the preset off, the package runs as itself and its closure is walked.
    expect(detectEcosystemPackages(root, named, [], [], [])).toContain("@gorhom/portal");
  });

  it("does not walk a named package transform.exclude also names", () => {
    const detected = detectEcosystemPackages(flashLike(), ["flash-ish"], [], ["flash-ish"]);
    expect(detected).not.toContain("screen-helper-ish");
  });

  it("still honours transform.exclude inside that closure", () => {
    const detected = detectEcosystemPackages(flashLike(), ["flash-ish"], [], ["screen-helper-ish"]);
    expect(detected).not.toContain("screen-helper-ish");
    expect(detected).not.toContain("helper-dep");
  });
});

describe("ecosystem detection: workspace members the run reaches", () => {
  /**
   * A pnpm-shaped workspace: `feature` depends on the workspace library `@w/ui` (which
   * declares expo-image and publishes an exports map without "./package.json"), and can
   * alias into `@w/tokens`, which it does not declare. `app` declares expo, so expo is
   * detected; expo reaches expo-asset only through its own dependencies.
   */
  function monorepo(): { root: string; feature: string; tokens: string } {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-members-")));
    roots.push(root);
    const write = (file: string, value: unknown) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value));
    };
    const link = (target: string, at: string) => {
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.symlinkSync(target, at, "junction");
    };
    write(path.join(root, "package.json"), {
      name: "w",
      private: true,
      workspaces: ["packages/*"],
    });
    const store = (name: string) =>
      path.join(root, "node_modules", ".pnpm", name, "node_modules", name);
    const pkg = (name: string, fields: Record<string, unknown>) =>
      write(path.join(store(name), "package.json"), { name, version: "1.0.0", ...fields });
    pkg("react-native", {});
    pkg("expo", { peerDependencies: { "react-native": "*" }, dependencies: { "expo-asset": "*" } });
    pkg("expo-asset", { peerDependencies: { expo: "*", "react-native": "*" } });
    pkg("expo-image", { peerDependencies: { expo: "*", "react-native": "*" } });
    pkg("rn-widget", {
      peerDependencies: { "react-native": "*" },
      dependencies: { "widget-internals": "*" },
    });
    pkg("widget-internals", {});
    link(store("expo-asset"), path.join(path.dirname(store("expo")), "expo-asset"));
    link(store("expo"), path.join(path.dirname(store("expo-image")), "expo"));
    link(
      store("widget-internals"),
      path.join(path.dirname(store("rn-widget")), "widget-internals"),
    );
    const member = (dir: string, manifest: Record<string, unknown>, links: string[]) => {
      const at = path.join(root, "packages", dir);
      write(path.join(at, "package.json"), manifest);
      for (const name of links) link(store(name), path.join(at, "node_modules", name));
      return at;
    };
    member("app", { name: "@w/app", dependencies: { expo: "*", "react-native": "*" } }, [
      "expo",
      "react-native",
    ]);
    const ui = member(
      "ui",
      {
        name: "@w/ui",
        exports: { ".": "./src/index.tsx" },
        dependencies: { "expo-image": "*" },
        peerDependencies: { "react-native": "*" },
      },
      ["expo-image", "react-native"],
    );
    const tokens = member("tokens", { name: "@w/tokens", dependencies: { "rn-widget": "*" } }, [
      "rn-widget",
    ]);
    const feature = member(
      "feature",
      { name: "@w/feature", dependencies: { "@w/ui": "workspace:*", "react-native": "*" } },
      ["react-native"],
    );
    link(ui, path.join(feature, "node_modules", "@w", "ui"));
    return { root, feature, tokens };
  }
  const detect = (
    dir: string,
    reachedPaths: string[] = [],
    onReachedUndeclared?: (n: string) => void,
  ) =>
    detectEcosystemPackages(dir, [], [], [], [], undefined, { reachedPaths, onReachedUndeclared });

  it("walks what a declared workspace member depends on", () => {
    // feature declares @w/ui; @w/ui reaches expo-image, whose peer expo reaches expo-asset.
    const { feature } = monorepo();
    expect(detect(feature)).toEqual(expect.arrayContaining(["expo-image", "expo", "expo-asset"]));
  });

  it("does not detect the workspace member itself", () => {
    // Which owner a workspace library has is the ownership track's decision (#427).
    expect(detect(monorepo().feature)).not.toContain("@w/ui");
  });

  it("walks what an aliased, undeclared workspace member depends on, and names it", () => {
    const { feature, tokens } = monorepo();
    const named: string[] = [];
    const detected = detect(feature, [path.join(tokens, "src")], (name) => named.push(name));
    expect(detected).toEqual(expect.arrayContaining(["rn-widget", "widget-internals"]));
    expect(named).toEqual(["@w/tokens"]);
  });

  it("does not walk a member the run neither declares nor aliases into", () => {
    expect(detect(monorepo().feature)).not.toContain("widget-internals");
  });

  // Where a resolve.alias config points, as the plugin hands it to the walk.
  const viaAlias = (dir: string, alias: unknown, named?: (n: string) => void) =>
    detect(dir, aliasReachedPaths(alias, dir), named);

  it("walks what a member reached through a RegExp alias depends on, and names it", () => {
    const { feature, tokens } = monorepo();
    const named: string[] = [];
    const alias = [{ find: /^@tokens\/(.*)$/, replacement: `${tokens}/src/$1` }];
    expect(viaAlias(feature, alias, (n) => named.push(n))).toEqual(
      expect.arrayContaining(["rn-widget", "widget-internals"]),
    );
    expect(named).toEqual(["@w/tokens"]);
  });

  it("walks a member a RegExp alias reaches with a literal replacement", () => {
    const { feature, tokens } = monorepo();
    const alias = [{ find: /^@tokens$/, replacement: path.join(tokens, "src", "index.ts") }];
    expect(viaAlias(feature, alias)).toContain("widget-internals");
  });

  it("walks a member a string alias with a customResolver reaches", () => {
    const { feature, tokens } = monorepo();
    const alias = [{ find: "@tokens", replacement: tokens, customResolver: () => null }];
    expect(viaAlias(feature, alias)).toContain("widget-internals");
  });

  it("reaches no member when the substitution chooses the member", () => {
    // `packages/$1` could be any member; walking them all is the seeding #433 rejected.
    const { feature } = monorepo();
    const alias = [{ find: /^@w\/([^/]+)$/, replacement: `${path.dirname(feature)}/$1` }];
    expect(viaAlias(feature, alias)).not.toContain("widget-internals");
  });

  it("resolves no more packages than before for a config without RegExp aliases", () => {
    // Counts, not timing: the dependency-directory lookups the walk makes with #433's
    // seeds (string aliases, through the compat layer's list) and with every alias's.
    const { feature, tokens } = monorepo();
    const lookups = (reachedPaths: string[]) => {
      let calls = 0;
      const counted: typeof dependencyDirOf = (...args) => {
        calls++;
        return dependencyDirOf(...args);
      };
      detectEcosystemPackages(feature, [], [], [], [], counted, { reachedPaths });
      return calls;
    };
    for (const alias of [undefined, { "@tokens": tokens, "@rel": "./src", lib: "lodash-es" }]) {
      const before = serializableAliases(alias, feature)
        .entries.map(([, target]) => target)
        .filter((target) => path.isAbsolute(target));
      expect(lookups(aliasReachedPaths(alias, feature))).toBe(lookups(before));
    }
  });

  it("reaches nothing through an alias to a package name", () => {
    const { feature } = monorepo();
    expect(viaAlias(feature, [{ find: /^tokens$/, replacement: "@w/tokens" }])).not.toContain(
      "widget-internals",
    );
  });
});

describe("ecosystem detection: what a reached workspace member may add", () => {
  type Spec = {
    workspaces?: string[];
    installed?: Record<string, Record<string, unknown>>;
    members: Record<string, { name: string; manifest?: Record<string, unknown>; links?: string[] }>;
  };
  /**
   * A pnpm-shaped workspace: installed packages in a store, each linked where a member
   * declares it; a member that declares another member gets a link to that member's
   * directory, as `workspace:*` does.
   */
  function workspace({ workspaces = ["packages/*"], installed = {}, members }: Spec) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-reach-")));
    roots.push(root);
    const write = (file: string, value: unknown) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value));
    };
    const link = (target: string, at: string) => {
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.symlinkSync(target, at, "junction");
    };
    write(path.join(root, "package.json"), { name: "w", private: true, workspaces });
    const store = (name: string) =>
      path.join(root, "node_modules", ".pnpm", name.replace("/", "+"), "node_modules", name);
    for (const [name, fields] of Object.entries(installed)) {
      write(path.join(store(name), "package.json"), { name, version: "1.0.0", ...fields });
    }
    for (const [name, fields] of Object.entries(installed)) {
      const deps = { ...(fields.dependencies as object), ...(fields.peerDependencies as object) };
      for (const dep of Object.keys(deps)) {
        if (dep in installed) link(store(dep), path.join(path.dirname(store(name)), dep));
      }
    }
    const dirs: Record<string, string> = {};
    for (const [dir, { name, manifest = {} }] of Object.entries(members)) {
      dirs[name] = path.join(root, "packages", dir);
      write(path.join(dirs[name], "package.json"), { name, version: "1.0.0", ...manifest });
    }
    for (const { name, manifest = {}, links = [] } of Object.values(members)) {
      const deps = Object.keys({ ...(manifest.dependencies as object) });
      for (const dep of [...links, ...deps]) {
        const target = dirs[dep] ?? (dep in installed ? store(dep) : null);
        if (target) link(target, path.join(dirs[name], "node_modules", ...dep.split("/")));
      }
    }
    return dirs;
  }
  const detect = (dir: string, reachedPaths: string[] = [], named: string[] = []) =>
    detectEcosystemPackages(dir, [], [], [], [], undefined, {
      reachedPaths,
      onReachedUndeclared: (name) => named.push(name),
    });
  const rn = { peerDependencies: { "react-native": "*" } };

  // RN workspace libraries @w/c and @w/e (detected: their exports list ./package.json);
  // @w/c depends on @w/e, which depends on the plain workspace member @w/d.
  const lib = (deps: Record<string, string>) => ({
    ...rn,
    exports: { ".": "./index.js", "./package.json": "./package.json" },
    dependencies: deps,
  });
  const probe = (appDeclaresC: boolean, direct = false) =>
    workspace({
      installed: { "react-native": {} },
      members: {
        app: {
          name: "@w/app",
          manifest: {
            dependencies: {
              "react-native": "*",
              ...(appDeclaresC ? { "@w/c": "workspace:*" } : {}),
            },
          },
        },
        c: {
          name: "@w/c",
          manifest: lib(direct ? { "@w/d": "workspace:*" } : { "@w/e": "workspace:*" }),
        },
        e: { name: "@w/e", manifest: lib({ "@w/d": "workspace:*" }) },
        d: { name: "@w/d", manifest: { main: "index.js" } },
      },
    });

  it("adds no workspace member through an alias: each keeps the owner it has on main", () => {
    const dirs = probe(false);
    expect(detect(dirs["@w/app"], [path.join(dirs["@w/c"], "src")])).not.toContain("@w/d");
  });

  it("adds no plain member an aliased RN workspace library depends on directly", () => {
    const dirs = probe(false, true);
    expect(detect(dirs["@w/app"], [path.join(dirs["@w/c"], "src")])).not.toContain("@w/d");
  });

  it("leaves a declared RN workspace library's closure as it was", () => {
    const dirs = probe(true);
    expect(detect(dirs["@w/app"])).toEqual(expect.arrayContaining(["@w/c", "@w/e", "@w/d"]));
  });

  // feature → @w/ui → @w/ui2 → rn-image (installed, RN) → image-internals (installed).
  const chain = () =>
    workspace({
      installed: {
        // React Native depends on rn-owned-lib, so the precompiled registry owns it: it
        // is detected (it declares react-native) but excluded from every walk.
        "react-native": { dependencies: { "rn-owned-lib": "*" } },
        "rn-owned-lib": { ...rn, dependencies: { "owned-internals": "*" } },
        "owned-internals": {},
        "rn-image": { ...rn, dependencies: { "image-internals": "*" } },
        "image-internals": {},
        "plain-lib": {},
      },
      members: {
        feature: {
          name: "@w/feature",
          manifest: { dependencies: { "@w/ui": "workspace:*" } },
          links: ["react-native"],
        },
        ui: {
          name: "@w/ui",
          manifest: {
            ...rn,
            exports: { ".": "./index.js" },
            dependencies: {
              "@w/ui2": "workspace:*",
              "plain-lib": "*",
              "rn-owned-lib": "*",
            },
          },
        },
        // Not detected (its exports omit ./package.json), so only member → member reach finds it.
        ui2: {
          name: "@w/ui2",
          manifest: { ...rn, exports: { ".": "./index.js" }, dependencies: { "rn-image": "*" } },
        },
      },
    });

  it("follows a member a reached member declares (member → member)", () => {
    expect(detect(chain()["@w/feature"])).toEqual(
      expect.arrayContaining(["rn-image", "image-internals"]),
    );
  });

  it("does not add a reached member's dependency that is not React Native", () => {
    expect(detect(chain()["@w/feature"])).not.toContain("plain-lib");
  });

  it("does not walk a reached member's dependency that React Native owns", () => {
    expect(detect(chain()["@w/feature"])).not.toContain("owned-internals");
  });

  it("does not name a member the project declares, reached through an alias too", () => {
    const dirs = chain();
    const named: string[] = [];
    detect(dirs["@w/feature"], [path.join(dirs["@w/ui"], "src")], named);
    expect(named).toEqual([]);
  });

  it("does not treat the project's own source as a reached member", () => {
    const dirs = chain();
    const named: string[] = [];
    detect(dirs["@w/feature"], [path.join(dirs["@w/feature"], "src")], named);
    expect(named).toEqual([]);
  });

  it("names the innermost of nested members an alias points into", () => {
    const dirs = workspace({
      workspaces: ["packages/*", "packages/kit/*"],
      installed: { "react-native": {} },
      members: {
        app: { name: "@w/app", manifest: { dependencies: { "react-native": "*" } } },
        kit: { name: "@w/kit" },
        "kit/icons": { name: "@w/icons" },
      },
    });
    const named: string[] = [];
    const detected = detect(dirs["@w/app"], [path.join(dirs["@w/icons"], "src")], named);
    expect(named, JSON.stringify(detected)).toEqual(["@w/icons"]);
  });
});

describe("aliasReachedPaths: where a resolve.alias config points", () => {
  const root = path.resolve("/w/packages/feature");
  // What #433 seeded from: the compat layer's string entries with absolute targets.
  const stringSeeds = (alias: unknown) =>
    serializableAliases(alias, root)
      .entries.map(([, target]) => target)
      .filter((target) => path.isAbsolute(target));

  it("seeds nothing for a project without aliases, as before", () => {
    expect(aliasReachedPaths(undefined, root)).toEqual([]);
    expect(aliasReachedPaths({}, root)).toEqual([]);
    expect(aliasReachedPaths([], root)).toEqual([]);
  });

  it("seeds exactly what string aliases seeded before, in object and array form", () => {
    const object = { "@ui": "/w/packages/ui/src", "@rel": "./src", lodash: "lodash-es" };
    const array = Object.entries(object).map(([find, replacement]) => ({ find, replacement }));
    for (const alias of [object, array]) {
      expect(aliasReachedPaths(alias, root)).toEqual(stringSeeds(alias));
    }
  });

  it("adds the target of a RegExp alias, which the compat layer skips", () => {
    const alias = [{ find: /^@ui$/, replacement: "/w/packages/ui/src/index.ts" }];
    expect(stringSeeds(alias)).toEqual([]);
    expect(aliasReachedPaths(alias, root)).toEqual(["/w/packages/ui/src/index.ts"]);
  });

  it("keeps only the fixed part of a replacement that substitutes the match", () => {
    const alias = [
      { find: /^@ui\/(.*)$/, replacement: "/w/packages/ui/src/$1" },
      { find: /^@w\/(.*)$/, replacement: "/w/packages/$1/src" },
    ];
    expect(aliasReachedPaths(alias, root)).toEqual(["/w/packages/ui/src/", "/w/packages/"]);
  });

  it("keeps a `$` that String.replace does not substitute as part of the path", () => {
    // String finds seed what they did before: their `$1` is literal too.
    const alias = {
      "@ci": "/home/ci/$work/packages/ui",
      "@share": "/mnt/c$/repo/packages/ui",
      "@one": "/w/$1/ui",
    };
    expect(aliasReachedPaths(alias, root)).toEqual(Object.values(alias));
    expect(aliasReachedPaths(alias, root)).toEqual(stringSeeds(alias));
  });

  it("reads `$$` as `$` and stops at every substitution String.replace makes", () => {
    const alias = [
      { find: "@a", replacement: "/w/a$$b/ui" },
      { find: "@b", replacement: "/w/packages/ui$&" },
      { find: /^@c$/, replacement: "/w/packages/ui/$<rest>" },
      { find: /^@d$/, replacement: "/w/packages/ui/$'" },
      { find: /^@e$/, replacement: "/w/packages/ui/$`" },
      { find: /^@f$/, replacement: "/w/$work/ui" },
    ];
    expect(aliasReachedPaths(alias, root)).toEqual([
      "/w/a$b/ui",
      "/w/packages/ui",
      "/w/packages/ui/",
      "/w/packages/ui/",
      "/w/packages/ui/",
      "/w/$work/ui",
    ]);
  });

  it("ignores a replacement that is not a string or not a path", () => {
    const alias = [
      { find: /^a$/, replacement: undefined },
      { find: /^b$/, replacement: "some-package" },
      { find: /^c$/, replacement: "$1" },
      null,
    ];
    expect(aliasReachedPaths(alias, root)).toEqual([]);
  });
});

describe("the plugin seeds the walk from every resolve.alias entry", () => {
  // This package runs inside the repository's workspace, beside apps/example
  // (@vitest-native/example), which it does not declare: an alias into it reaches an
  // undeclared member, and `diagnostics` names it. Through the plugin, so a regression in
  // what plugin.ts hands detectEcosystemPackages fails here, not only in the museum.
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const example = path.resolve(packageRoot, "../../apps/example");
  const reachedLog = async (alias: unknown) => {
    vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { reactNative } = await import("../src/index.js");
      const { runPluginConfig } = await import("./plugin-config.js");
      await runPluginConfig(reactNative({ engine: "native", diagnostics: true }), {
        root: packageRoot,
        resolve: { alias },
      });
      return log.mock.calls
        .map((args) => String(args[0]))
        .filter((line) => line.includes("is reached through an alias"));
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }
  };

  it("names a member reached through a RegExp alias", async () => {
    const alias = [{ find: /^@example\/(.*)$/, replacement: `${example}/src/$1` }];
    expect(await reachedLog(alias)).toEqual([expect.stringContaining("@vitest-native/example")]);
  });

  it("names a member reached through a string alias, as before", async () => {
    expect(await reachedLog({ "@example": example })).toEqual([
      expect.stringContaining("@vitest-native/example"),
    ]);
  });

  it("names nothing without an alias into a member", async () => {
    expect(await reachedLog(undefined)).toEqual([]);
  });
});
