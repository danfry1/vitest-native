import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";

/** A throwaway project with the given packages installed. */
function project(manifest: Record<string, unknown>, installed: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-eco-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "app", ...manifest }));
  for (const [name, pkg] of Object.entries(installed)) {
    const target = path.join(dir, "node_modules", ...name.split("/"));
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "package.json"),
      JSON.stringify({ name, version: "1.0.0", main: "index.js", ...(pkg as object) }),
    );
    fs.writeFileSync(path.join(target, "index.js"), "module.exports = {};");
  }
  return dir;
}

const rnDep = { peerDependencies: { "react-native": "*" } };

describe("detectEcosystemPackages", () => {
  it("finds packages that declare react-native, by manifest rather than by name", () => {
    const dir = project(
      { dependencies: { "@gorhom/some-sheet": "1", "plain-utils": "1", "react-native-ish": "1" } },
      {
        // Scoped, so a `react-native-*` name heuristic would have missed it.
        "@gorhom/some-sheet": rnDep,
        // Unrelated package that happens to be a dependency.
        "plain-utils": {},
        // Named like an RN package but does not depend on one.
        "react-native-ish": {},
      },
    );
    expect(detectEcosystemPackages(dir)).toEqual(["@gorhom/some-sheet"]);
  });

  // expo-symbols 57 publishes `exports: { ".": "./build/index.js", ... }` with no
  // "./package.json", so `require.resolve("expo-symbols/package.json")` throws. It went
  // undetected, its ES module build was never compiled, and Node (22.13) ran it raw:
  // "Cannot find module '…/build/materialImageSource'" on Android, where expo-router
  // requires it.
  it("detects a package whose exports map leaves out ./package.json", () => {
    const dir = project(
      { dependencies: { "symbols-like": "1" } },
      { "symbols-like": { ...rnDep, exports: { ".": "./index.js" } } },
    );
    expect(detectEcosystemPackages(dir)).toEqual(["symbols-like"]);
  });

  it("detects one whose exports offer only an import condition", () => {
    // Neither `pkg/package.json` nor the entry resolves through require here.
    const dir = project(
      { dependencies: { "import-only": "1" } },
      { "import-only": { ...rnDep, exports: { ".": { import: "./index.js" } } } },
    );
    expect(detectEcosystemPackages(dir)).toEqual(["import-only"]);
  });

  it("walks into a dependency whose exports map leaves out ./package.json", () => {
    const dir = project(
      { dependencies: { "rn-lib": "1" } },
      {
        "rn-lib": { ...rnDep, dependencies: { "hidden-manifest": "1" } },
        "hidden-manifest": { exports: { ".": "./index.js" } },
      },
    );
    expect(detectEcosystemPackages(dir).sort()).toEqual(["hidden-manifest", "rn-lib"]);
  });

  it("accepts a runtime dependency on react-native, not only a peer one", () => {
    const dir = project(
      { dependencies: { "some-lib": "1" } },
      { "some-lib": { dependencies: { "react-native": "0.86.0" } } },
    );
    expect(detectEcosystemPackages(dir)).toEqual(["some-lib"]);
  });

  it("skips packages a preset already shadows", () => {
    // Their real source never loads, so inlining it would be wasted work.
    const dir = project(
      { dependencies: { "react-native-reanimated": "1" } },
      { "react-native-reanimated": rnDep },
    );
    expect(detectEcosystemPackages(dir)).toEqual([]);
  });

  it("never inlines the test infrastructure", () => {
    // A second copy of RNTL or a renderer in the graph has corrupted rendering
    // before, in ways that surface as unrelated act() and host-name failures.
    const dir = project(
      { devDependencies: { "@testing-library/react-native": "1", "react-test-renderer": "1" } },
      { "@testing-library/react-native": rnDep, "react-test-renderer": rnDep },
    );
    expect(detectEcosystemPackages(dir)).toEqual([]);
  });

  it("yields to an explicit transform entry", () => {
    // `transform` keeps its existing meaning — externalized, compiled by the Node
    // hooks — so listing a package there has to win over auto-inlining it.
    const dir = project({ dependencies: { "some-lib": "1" } }, { "some-lib": rnDep });
    expect(detectEcosystemPackages(dir)).toEqual(["some-lib"]);
    expect(detectEcosystemPackages(dir, ["some-lib"])).toEqual([]);
  });

  it("sees dependencies declared above the project, as workspaces do", () => {
    // An app package often inherits its React Native libraries from the repository
    // root, and a Vitest `root` can point above or below the package that owns them.
    // Reading only the project's own manifest found nothing in those layouts.
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-ws-"));
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "monorepo", private: true, dependencies: { "rn-lib": "1" } }),
    );
    const dep = path.join(root, "node_modules", "rn-lib");
    fs.mkdirSync(dep, { recursive: true });
    fs.writeFileSync(
      path.join(dep, "package.json"),
      JSON.stringify({ name: "rn-lib", version: "1.0.0", main: "index.js", ...rnDep }),
    );
    fs.writeFileSync(path.join(dep, "index.js"), "module.exports = {};");
    const app = path.join(root, "apps", "mobile");
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "mobile" }));

    expect(detectEcosystemPackages(app)).toEqual(["rn-lib"]);
  });

  it("ignores declared packages that are not installed", () => {
    const dir = project({ dependencies: { "never-installed": "1" } }, {});
    expect(detectEcosystemPackages(dir)).toEqual([]);
  });

  it("returns nothing for a project without a readable manifest", () => {
    expect(detectEcosystemPackages(fs.mkdtempSync(path.join(os.tmpdir(), "vn-none-")))).toEqual([]);
  });
});

// experimental.ownershipModel: the shared resolver honours a package's `react-native` field
// on both module systems, as Metro does. A field naming source Node cannot run (JSX, Flow)
// would otherwise load raw, so the package is compiled.
describe("detectEcosystemPackages with compileReactNativeFieldSource", () => {
  const babelCore = path.dirname(
    createRequire(import.meta.url).resolve("@babel/core/package.json"),
  );

  /** A project with Babel installed and one package whose `react-native` field holds `source`. */
  function fieldProject(
    file: string,
    source: string,
    fields: Record<string, unknown> = {},
  ): string {
    const dir = project(
      { dependencies: { "field-pkg": "1" } },
      // No react-native dependency: nothing else selects it.
      { "field-pkg": { "react-native": file, ...fields } },
    );
    const target = path.join(dir, "node_modules", "field-pkg", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
    linkBabel(dir);
    return dir;
  }
  const profile = { platform: "ios", sourceExts: ["js", "jsx", "json", "ts", "tsx"] };
  const detect = (dir: string | string[], on = true, sourceExts = profile.sourceExts) =>
    detectEcosystemPackages(dir, [], [], [], [], undefined, {
      compileReactNativeFieldSource: on ? { ...profile, sourceExts } : undefined,
    });
  const linkBabel = (dir: string) => {
    fs.mkdirSync(path.join(dir, "node_modules", "@babel"), { recursive: true });
    fs.symlinkSync(babelCore, path.join(dir, "node_modules", "@babel", "core"), "junction");
  };

  it("compiles a package whose react-native field names JSX", () => {
    const dir = fieldProject("src.js", "export const A = () => <View />;\n");
    expect(detect(dir)).toEqual(["field-pkg"]);
    // Flag off: the field is not honoured on Node's side, so nothing changes.
    expect(detect(dir, false)).toEqual([]);
  });

  it("compiles one whose field names Flow", () => {
    const dir = fieldProject(
      "src.js",
      "// @flow\nexport function f(x: number): string { return ''; }\n",
    );
    expect(detect(dir)).toEqual(["field-pkg"]);
  });

  it("leaves a field Node runs as it is", () => {
    expect(detect(fieldProject("src.js", "export const a = 1;\n"))).toEqual([]);
  });

  it("leaves a TypeScript field, which the require hooks load", () => {
    expect(detect(fieldProject("src.ts", "export const a: number = 1;\n"))).toEqual([]);
  });

  it("leaves a package with exports, where the field is not the resolver's choice", () => {
    const dir = fieldProject("src.js", "export const A = () => <View />;\n", {
      exports: { ".": "./index.js" },
    });
    expect(detect(dir)).toEqual([]);
  });

  // The file is the shared resolver's own choice (mainFieldFile): platform files and
  // Metro's sourceExts order, not a fixed extension list.
  it("reads the platform file the resolver picks", () => {
    const dir = fieldProject("src/index.native.js", "export const A = () => <View />;\n", {
      "react-native": "src/index",
    });
    expect(detect(dir)).toEqual(["field-pkg"]);
  });

  it("reads the file Metro's sourceExts order picks", () => {
    // JSX in the .js, TypeScript first in sourceExts: the resolver loads the .ts.
    const dir = fieldProject("src/index.js", "export const A = () => <View />;\n", {
      "react-native": "src/index",
    });
    fs.writeFileSync(
      path.join(dir, "node_modules", "field-pkg", "src", "index.ts"),
      "export const a = 1;\n",
    );
    expect(detect(dir)).toEqual(["field-pkg"]);
    expect(detect(dir, true, ["ts", "tsx", "js", "jsx", "json"])).toEqual([]);
  });

  /** A workspace: the app declares a member (linked), a sibling declares an installed package. */
  function workspace(): string {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-eco-ws-"));
    const write = (file: string, content: unknown) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(
        path.join(root, file),
        typeof content === "string" ? content : JSON.stringify(content),
      );
    };
    const jsx = "export const A = () => <View />;\n";
    write("package.json", { name: "root", private: true, workspaces: ["app", "libs/*"] });
    write("app/package.json", { name: "app", dependencies: { "@w/ui": "*" } });
    write("libs/ui/package.json", {
      name: "@w/ui",
      version: "1.0.0",
      "react-native": "src/index.js",
    });
    write("libs/ui/src/index.js", jsx);
    write("libs/other/package.json", { name: "@w/other", dependencies: { sib: "1" } });
    write("node_modules/sib/package.json", {
      name: "sib",
      version: "1.0.0",
      "react-native": "src/index.js",
    });
    write("node_modules/sib/src/index.js", jsx);
    fs.mkdirSync(path.join(root, "node_modules", "@w"), { recursive: true });
    fs.symlinkSync(
      path.join(root, "libs", "ui"),
      path.join(root, "node_modules", "@w", "ui"),
      "junction",
    );
    linkBabel(root);
    return root;
  }

  it("leaves a workspace member to Vite, so vi.mock reaches its imports", () => {
    expect(detect(path.join(workspace(), "app"))).toEqual([]);
  });

  it("leaves a package only a sibling declares", () => {
    const root = workspace();
    expect(detect([path.join(root, "app"), root])).toEqual([]);
  });

  it("claims nothing without Babel's parser", () => {
    const dir = fieldProject("src.js", "export const A = () => <View />;\n");
    fs.rmSync(path.join(dir, "node_modules", "@babel"), { recursive: true });
    expect(detect(dir)).toEqual([]);
  });
});
