/**
 * The dependencies of an installed React Native package the run does not declare (#883).
 *
 * The installed scan (#718) makes such a package Node's, and compiles it, but does not walk
 * its dependencies: walking every scan-found package's closure grew a project that
 * declares little and shares node_modules with an app from 17 to 137 packages. A dependency
 * that ships source Node cannot run (JSX here, as react-native-animatable does) is then
 * loaded raw. Node fails it by name, naming the package that pulled it in and the option
 * that compiles it, before any of the file runs.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";
// @ts-expect-error — internal runtime .mjs, intentionally not public API
import { createNativeOwnershipPolicy } from "../src/native/ownership.mjs";

const nativeDir = path.resolve(import.meta.dirname, "../src/native");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

const JSX = "module.exports = () => <View />;\n";

/** Write a package at `node_modules/<at>` (a path, so nested copies can be written). */
function pkg(root: string, at: string, manifest: Record<string, unknown>, index: string) {
  const dir = path.join(root, "node_modules", ...at.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ version: "1.0.0", main: "index.js", ...manifest }),
  );
  fs.writeFileSync(path.join(dir, "index.js"), index);
  return dir;
}

/**
 * An app that declares only react-native. rn-undeclared is installed (hoisted) and
 * undeclared; it depends on jsx-dep, which ships JSX and declares no react-native, and on
 * plain-dep, which runs as published and has its own nested copy of nested-jsx.
 */
function app() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-scan-found-")));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "app", dependencies: { "react-native": "*" } }),
  );
  pkg(root, "react-native", { name: "react-native" }, "module.exports = {};\n");
  pkg(
    root,
    "rn-undeclared",
    {
      name: "rn-undeclared",
      peerDependencies: { "react-native": "*" },
      dependencies: {
        "jsx-dep": "*",
        "plain-dep": "*",
        "esm-dep": "*",
        "esm-deep": "*",
        "esm-dir": "*",
        "esm-bare": "*",
        "esm-typo": "*",
        "json-dep": "*",
      },
    },
    "exports.jsx = () => require('jsx-dep');\n" +
      "exports.nested = () => require('plain-dep').load();\n" +
      "exports.esm = () => require('esm-dep');\n" +
      "exports.deep = () => require('esm-deep');\n" +
      "exports.dir = () => require('esm-dir');\n" +
      "exports.bare = () => require('esm-bare');\n" +
      "exports.typo = () => require('esm-typo');\n" +
      "exports.runtime = () => require('json-dep');\n",
  );
  // expo-asset's shape: an ES module build with extensionless imports and no `type` field.
  const esmDep = pkg(root, "esm-dep", { name: "esm-dep", main: "build/index.js" }, "unused");
  fs.mkdirSync(path.join(esmDep, "build"));
  fs.writeFileSync(path.join(esmDep, "build", "index.js"), "export * from './Asset';\n");
  fs.writeFileSync(path.join(esmDep, "build", "Asset.js"), "export const asset = 1;\n");
  // The extensionless import is a file deeper than the one the CommonJS require entered.
  const esmDeep = esm(root, "esm-deep", {
    "index.js": "export * from './Asset.js';\n",
    "Asset.js": "export * from './Other';\n",
    "Other.js": "export const other = 1;\n",
  });
  // A directory import, which Node refuses with its own error code.
  const esmDir = esm(root, "esm-dir", {
    "index.js": "export * from './components';\n",
    "components/index.js": "export const c = 1;\n",
  });
  // Not fixable by compiling: a bare package that is not installed, and a typo.
  esm(root, "esm-bare", { "index.js": "export * from 'missing-peer';\n" });
  esm(root, "esm-typo", { "index.js": "export * from './Nope';\n" });
  // Compiles, then throws a SyntaxError as it runs: not a file Node could not compile.
  pkg(root, "json-dep", { name: "json-dep" }, "module.exports = JSON.parse('<html>');\n");
  const jsxDep = pkg(root, "jsx-dep", { name: "jsx-dep" }, JSX);
  pkg(
    root,
    "plain-dep",
    { name: "plain-dep", dependencies: { "nested-jsx": "*" } },
    // At the top level: a failure in nested-jsx passes through plain-dep's own load.
    "const nested = require('nested-jsx');\nexports.load = () => nested;\n",
  );
  const nestedJsx = pkg(root, "plain-dep/node_modules/nested-jsx", { name: "nested-jsx" }, JSX);
  return { root, jsxDep, nestedJsx, esmDep, esmDeep, esmDir };
}

/** An ES module build at `build/`, with no `type` field, as expo-asset publishes. */
function esm(root: string, name: string, files: Record<string, string>) {
  const dir = pkg(root, name, { name, main: "build/index.js" }, "unused");
  fs.mkdirSync(path.join(dir, "build"));
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, "build", file)), { recursive: true });
    fs.writeFileSync(path.join(dir, "build", file), source);
  }
  return dir;
}

function detect(root: string) {
  const found: [string, string, string][] = [];
  const detected = detectEcosystemPackages(root, [], [], [], [], undefined, {
    onScanFoundDependency: (dir, name, parent) => found.push([dir, name, parent]),
  });
  return { detected, found };
}

/** Require each of rn-undeclared's loaders under the real require hooks, in a fresh process. */
function loadUnderHooks(root: string, scanFound: [string, string, string][], ecosystem: string[]) {
  const source = `
import { createRequire } from 'node:module';
import path from 'node:path';
import { installRequireHooks } from ${JSON.stringify(pathToFileURL(path.join(nativeDir, "hooks.mjs")).href)};
import { createNativeOwnershipPolicy } from ${JSON.stringify(pathToFileURL(path.join(nativeDir, "ownership.mjs")).href)};
import { writeProjectContext } from ${JSON.stringify(pathToFileURL(path.join(nativeDir, "..", "context.mjs")).href)};
const root = ${JSON.stringify(root)};
const policy = createNativeOwnershipPolicy({ projectRoot: root, ecosystemPackages: ${JSON.stringify(ecosystem)} });
process.env.VITEST_NATIVE_CONTEXT = writeProjectContext({
  platform: 'ios', diagnostics: false, projectRoot: root, ownership: policy.manifest(),
  ${scanFound.length > 0 ? `scanFoundDependencies: ${JSON.stringify(scanFound)},` : ""}
}, path.join(root, '.contexts'));
installRequireHooks(root);
const lib = createRequire(path.join(root, 'driver.cjs'))('rn-undeclared');
const out = {};
for (const which of ['jsx', 'nested', 'esm', 'deep', 'dir', 'bare', 'typo', 'runtime']) {
  try { lib[which](); out[which] = { loaded: true }; }
  catch (e) { out[which] = { name: e.name, code: e.code, message: e.message }; }
}
process.stdout.write(JSON.stringify(out));
`;
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST_NATIVE_") || ["NODE_OPTIONS", "NODE_PATH"].includes(key)) {
      delete env[key];
    }
  }
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    env,
    encoding: "utf8",
    timeout: 20_000,
  });
  expect(child.stderr).toBe("");
  return JSON.parse(child.stdout) as Record<
    "jsx" | "nested" | "esm" | "deep" | "dir" | "bare" | "typo" | "runtime",
    { loaded?: true; name?: string; code?: string; message?: string }
  >;
}

describe("a dependency of an installed React Native package nothing declares (#883)", () => {
  it("is reported with the package that pulled it in, and not added to the set", () => {
    const { root, jsxDep, nestedJsx } = app();
    const { detected, found } = detect(root);
    expect(detected).toContain("rn-undeclared");
    expect(detected).not.toContain("jsx-dep");
    expect(detected).not.toContain("plain-dep");
    expect(detected).not.toContain("nested-jsx");
    expect(found).toEqual(
      expect.arrayContaining([
        [jsxDep, "jsx-dep", "rn-undeclared"],
        [nestedJsx, "nested-jsx", "rn-undeclared"],
      ]),
    );
  });

  it("fails by name when Node loads a JSX-shipping dependency or a nested copy", () => {
    const { root, jsxDep, nestedJsx } = app();
    const { detected, found } = detect(root);
    const loaded = loadUnderHooks(root, found, detected);
    for (const [which, dep, dir] of [
      ["jsx", "jsx-dep", jsxDep],
      ["nested", "nested-jsx", nestedJsx],
    ] as const) {
      expect(loaded[which].code).toBe("UNDECLARED_DEPENDENCY_UNCOMPILED");
      expect(loaded[which].message).toContain(`'${dep}' (${dir}) ships source Node can't run`);
      expect(loaded[which].message).toContain("a dependency of 'rn-undeclared'");
      expect(loaded[which].message).toContain(`reactNative({ transform: ['${dep}'] })`);
      expect(loaded[which].message).toContain("declare 'rn-undeclared'");
    }
  });

  it("fails by name when Node loads an ES module dependency it cannot link", () => {
    const { root, esmDep, esmDeep, esmDir } = app();
    const { detected, found } = detect(root);
    const loaded = loadUnderHooks(root, found, detected);
    for (const [which, dep, dir] of [
      ["esm", "esm-dep", esmDep],
      ["deep", "esm-deep", esmDeep],
      ["dir", "esm-dir", esmDir],
    ] as const) {
      expect(loaded[which].code).toBe("UNDECLARED_DEPENDENCY_UNCOMPILED");
      expect(loaded[which].message).toContain(`'${dep}' (${dir}) ships source Node can't run`);
      expect(loaded[which].message).toContain("a dependency of 'rn-undeclared'");
      expect(loaded[which].message).toContain(`reactNative({ transform: ['${dep}'] })`);
    }
  });

  it("does not name an import that compiling cannot fix: a missing package, or a typo", () => {
    const { root } = app();
    const { detected, found } = detect(root);
    const loaded = loadUnderHooks(root, found, detected);
    for (const which of ["bare", "typo"] as const) {
      expect(loaded[which].code, which).toBe("ERR_MODULE_NOT_FOUND");
      expect(loaded[which].message).not.toContain("transform:");
    }
    expect(loaded.bare.message).toContain("Cannot find package 'missing-peer'");
  });

  it("does not name a SyntaxError a dependency throws as it runs", () => {
    const { root } = app();
    const { detected, found } = detect(root);
    const loaded = loadUnderHooks(root, found, detected);
    expect(loaded.runtime.code).toBeUndefined();
    expect(loaded.runtime.message).not.toContain("UNDECLARED_DEPENDENCY_UNCOMPILED");
    expect(loaded.runtime.message).not.toContain("a dependency of 'rn-undeclared'");
  });

  it("does not blame a dependency that ran for a failure in a file it requires", () => {
    // plain-dep is recorded and runs as published; nested-jsx, which it requires, is not
    // recorded here. Its failure (already explained, for nested-jsx) must reach the test
    // as it is, not be wrapped again as plain-dep's.
    const { root } = app();
    const { detected, found } = detect(root);
    const loaded = loadUnderHooks(
      root,
      found.filter(([, name]) => name !== "nested-jsx"),
      detected,
    );
    expect(loaded.nested.code).toBeUndefined();
    expect(loaded.nested.message).toContain("'nested-jsx' shipped source Node can't run");
    expect(loaded.nested.message).not.toContain("'plain-dep'");
  });

  it("names a remedy that compiles the dependency", () => {
    const { root, jsxDep, nestedJsx } = app();
    for (const [dep, dir] of [
      ["jsx-dep", jsxDep],
      ["nested-jsx", nestedJsx],
    ]) {
      const file = path.join(dir, "index.js");
      const before = createNativeOwnershipPolicy({ projectRoot: root, ecosystemPackages: [] });
      const after = createNativeOwnershipPolicy({
        projectRoot: root,
        explicitTransforms: [dep],
        ecosystemPackages: [],
      });
      expect(before.matchesNodeTransformedFile(file)).toBe(false);
      expect(after.matchesNodeTransformedFile(file)).toBe(true);
    }
    // Declaring the parent makes it a seed: its dependencies, and the nested copy, join.
    const pkgJson = path.join(root, "package.json");
    fs.writeFileSync(
      pkgJson,
      JSON.stringify({
        name: "app",
        dependencies: { "react-native": "*", "rn-undeclared": "*" },
      }),
    );
    const { detected, found } = detect(root);
    expect(detected).toEqual(expect.arrayContaining(["jsx-dep", "plain-dep", "nested-jsx"]));
    expect(found).toEqual([]);
  });
});
