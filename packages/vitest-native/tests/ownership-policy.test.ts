import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createNativeOwnershipPolicy,
  findNativeInlineConflicts,
  findNativeOwnershipConflict,
  formatNativeOwnershipManifest,
  isRuntimeResidentFile,
  isTestRuntimeResidentFile,
  parseNativeOwnershipManifest,
} from "../src/native/ownership.mjs";

describe("native ownership policy", () => {
  const root = path.resolve("/repo/app");
  const policy = createNativeOwnershipPolicy({
    projectRoot: root,
    explicitTransforms: ["explicit-lib", "shared-lib"],
    ecosystemPackages: ["ecosystem-lib", "shared-lib"],
    runtimeTransformAugmentations: ["preset-pass-through-modules"],
    projectDirs: [root],
  });

  it("produces one deduplicated Node transform and externalization set", () => {
    expect(policy.nodeTransformPackages).toEqual(["explicit-lib", "shared-lib", "ecosystem-lib"]);
    for (const name of policy.nodeTransformPackages) {
      const file = `/repo/app/node_modules/${name}/index.js`;
      expect(policy.matchesNodeTransformedFile(file)).toBe(true);
      expect(policy.externalPatterns.some((pattern) => pattern.test(file))).toBe(true);
    }
    expect(policy.externalPatterns.some((pattern) => pattern.test("/repo/app/src/index.ts"))).toBe(
      false,
    );
  });

  it("gives Vitest mutable pattern arrays while keeping policy evidence immutable", () => {
    // Vitest sorts these in place when constructing its resolver. Freezing them made
    // native runs fail during startup even though all predicate tests were green.
    expect(() => (policy.externalPatterns as RegExp[]).sort(() => 0)).not.toThrow();
    expect(() => (policy.testEntryPatterns as RegExp[]).sort(() => 0)).not.toThrow();
    expect(Object.isFrozen(policy.manifest())).toBe(true);
  });

  it("returns structured provenance for every governed file class", () => {
    expect(policy.decideFile("/repo/app/src/button.test.tsx")).toMatchObject({
      owner: "vite",
      reset: "per-file",
      reason: "test-entry",
    });
    expect(policy.decideFile("/repo/app/src/button.test.tsx?boot=1")).toMatchObject({
      owner: "vite",
      reset: "per-file",
      reason: "test-entry",
    });
    expect(policy.decideFile("/repo/app/src/button.tsx")).toMatchObject({
      owner: "vite",
      reset: "per-file",
      reason: "project-source",
    });
    expect(policy.decideFile("/repo/app/node_modules/react-native/index.js")).toMatchObject({
      owner: "node",
      transform: "registry",
      reset: "worker-resident",
      reason: "react-native-core",
    });
    expect(policy.decideFile("/repo/app/node_modules/explicit-lib/index.js")).toMatchObject({
      owner: "node",
      transform: "native-babel",
      reset: "per-file",
      reason: "explicit-transform",
    });
    expect(policy.decideFile("/repo/app/node_modules/ecosystem-lib/index.js")).toMatchObject({
      owner: "node",
      transform: "native-babel",
      reset: "per-file",
      reason: "ecosystem-detected",
    });
    expect(policy.decideFile("/repo/app/node_modules/react/index.js")).toMatchObject({
      owner: "vitest-default",
      reset: "worker-resident-if-external",
      reason: "identity-sensitive-runtime",
    });
    expect(policy.decideFile("/repo/app/node_modules/vitest/dist/index.js")).toMatchObject({
      owner: "vitest-default",
      reset: "worker-resident-if-external",
      reason: "test-runtime",
    });
    expect(policy.decideFile("/repo/app/node_modules/plain-lib/index.js")).toMatchObject({
      owner: "vitest-default",
      reason: "delegated",
    });
  });

  it("keeps runtime persistence identical across ESM generation and CJS reset", () => {
    for (const file of [
      "/repo/node_modules/react/index.js",
      "/repo/node_modules/react-test-renderer/index.js",
      "/repo/node_modules/@testing-library/react-native/build/index.js",
    ]) {
      expect(isRuntimeResidentFile(file)).toBe(true);
      expect(policy.decideFile(file).reset).toBe("worker-resident-if-external");
    }
    expect(isRuntimeResidentFile("/repo/node_modules/stateful-library/index.js")).toBe(false);
    expect(isTestRuntimeResidentFile("/repo/node_modules/@vitest/runner/dist/index.js")).toBe(true);
    expect(isTestRuntimeResidentFile("/repo/node_modules/vitest-native/dist/index.mjs")).toBe(true);
  });

  it("keeps a linked React Native realpath Node-owned outside node_modules", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "vn-linked-rn-owner-"));
    const projectRoot = path.join(fixture, "app");
    const linkedRoot = path.join(fixture, "workspace", "react-native");
    fs.mkdirSync(path.join(projectRoot, "node_modules"), { recursive: true });
    fs.mkdirSync(path.join(linkedRoot, "Libraries", "Utilities"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "package.json"), '{"name":"app"}\n');
    fs.writeFileSync(
      path.join(linkedRoot, "package.json"),
      '{"name":"react-native","main":"index.js"}\n',
    );
    fs.writeFileSync(path.join(linkedRoot, "index.js"), "module.exports = {}\n");
    fs.symlinkSync(linkedRoot, path.join(projectRoot, "node_modules", "react-native"), "dir");
    try {
      const canonicalLinkedRoot = fs.realpathSync(linkedRoot);
      const linked = createNativeOwnershipPolicy({
        projectRoot,
        // Deliberately broad: the linked package is physically under this workspace,
        // so path-only project-source classification would otherwise win.
        projectDirs: [fixture],
      });
      const file = path.join(canonicalLinkedRoot, "Libraries", "Utilities", "Platform.ios.js");

      expect(linked.decideFile(file)).toMatchObject({
        owner: "node",
        transform: "registry",
        reason: "react-native-core",
      });
      expect(linked.externalPatterns.some((pattern) => pattern.test(file))).toBe(true);
      expect(linked.manifest().reactNativeRoots).toContain(canonicalLinkedRoot);
      expect(linked.isReactNativeFile(file)).toBe(true);
      expect(linked.reactNativePathFor(file)).toBe(
        "/react-native/Libraries/Utilities/Platform.ios.js",
      );
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("actually Flow-compiles a linked React Native realpath in the CJS hook", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "vn-linked-rn-runtime-"));
    const projectRoot = path.join(fixture, "app");
    const linkedRoot = path.join(fixture, "workspace", "renamed-rn-source");
    const modules = path.join(projectRoot, "node_modules");
    fs.mkdirSync(modules, { recursive: true });
    fs.mkdirSync(linkedRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "package.json"), '{"name":"app"}\n');
    fs.writeFileSync(
      path.join(linkedRoot, "package.json"),
      '{"name":"react-native","main":"index.js"}\n',
    );
    fs.writeFileSync(
      path.join(linkedRoot, "index.js"),
      '// @flow\nconst inner = require("./Libraries/Utilities/Inner");\nconst turbo = require("./Libraries/TurboModule/TurboModuleRegistry");\nfunction identity(value: string): string { return inner(value); }\nmodule.exports = { identity, hasTurbo: typeof turbo.get === "function" };\n',
    );
    fs.mkdirSync(path.join(linkedRoot, "Libraries", "Utilities"), { recursive: true });
    fs.mkdirSync(path.join(linkedRoot, "Libraries", "TurboModule"), { recursive: true });
    fs.writeFileSync(
      path.join(linkedRoot, "Libraries", "Utilities", "Inner.js"),
      "// @flow\nmodule.exports = function inner(value: string): string { return value; };\n",
    );
    fs.writeFileSync(
      path.join(linkedRoot, "Libraries", "TurboModule", "TurboModuleRegistry.js"),
      'throw new Error("real native boundary loaded");\n',
    );
    fs.symlinkSync(linkedRoot, path.join(modules, "react-native"), "dir");

    const packageRequire = createRequire(path.join(import.meta.dirname, "../package.json"));
    const presetRoot = path.dirname(
      packageRequire.resolve("@react-native/babel-preset/package.json"),
    );
    const babelRoot = path.dirname(packageRequire.resolve("@babel/core/package.json"));
    fs.mkdirSync(path.join(modules, "@react-native"), { recursive: true });
    fs.mkdirSync(path.join(modules, "@babel"), { recursive: true });
    fs.symlinkSync(presetRoot, path.join(modules, "@react-native", "babel-preset"), "dir");
    fs.symlinkSync(babelRoot, path.join(modules, "@babel", "core"), "dir");

    const hooks = path.resolve(import.meta.dirname, "../src/native/hooks.mjs");
    const loader = path.resolve(import.meta.dirname, "../src/native/loader.mjs");
    const registry = path.resolve(import.meta.dirname, "../src/native/registry.mjs");
    const canonicalLinkedRoot = fs.realpathSync(linkedRoot);
    const script = [
      `import { createRequire } from "node:module";`,
      `import { pathToFileURL } from "node:url";`,
      `import { installRequireHooks } from ${JSON.stringify(pathToFileURL(hooks).href)};`,
      `import { initialize, load } from ${JSON.stringify(pathToFileURL(loader).href)};`,
      `import { buildRegistry } from ${JSON.stringify(pathToFileURL(registry).href)};`,
      `const root = ${JSON.stringify(projectRoot)};`,
      `const req = createRequire(root + "/package.json");`,
      `const registryFile = buildRegistry({ projectRoot: root, platform: "ios" });`,
      `if (!registryFile) throw new Error("linked RN registry was not built");`,
      `const built = req(registryFile);`,
      `if (built.identity("registry") !== "registry") throw new Error("linked RN registry returned the wrong value");`,
      `if (!built.hasTurbo) throw new Error("linked RN registry missed the native boundary");`,
      `if (built.__vitestNativeRegistry.ids.length !== 3) throw new Error("linked RN dependency was not inlined");`,
      `await initialize({ projectRoot: root, platform: "ios", transformPkgs: [] });`,
      `const innerFile = ${JSON.stringify(path.join(canonicalLinkedRoot, "Libraries", "Utilities", "Inner.js"))};`,
      `const esmInner = await load(pathToFileURL(innerFile).href, {}, async () => ({ format: "module", source: "sentinel" }));`,
      `if (esmInner.format !== "commonjs" || esmInner.source === "sentinel" || esmInner.source.includes("value: string")) throw new Error("linked RN ESM loader did not transform Flow: " + JSON.stringify(esmInner));`,
      `const boundaryFile = ${JSON.stringify(path.join(canonicalLinkedRoot, "Libraries", "TurboModule", "TurboModuleRegistry.js"))};`,
      `const esmBoundary = await load(pathToFileURL(boundaryFile).href, {}, async () => ({ format: "module", source: "sentinel" }));`,
      `if (!esmBoundary.source.includes("exports.get")) throw new Error("linked RN ESM loader missed the native boundary");`,
      `installRequireHooks(root, [], "ios", "0.0.0", []);`,
      `const live = req("react-native");`,
      `const value = live.identity("linked");`,
      `if (value !== "linked") throw new Error("unexpected linked RN result: " + value);`,
      `if (!live.hasTurbo) throw new Error("linked RN CJS hook missed the native boundary");`,
    ].join("\n");

    try {
      expect(() =>
        execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
          cwd: projectRoot,
          env: process.env,
          stdio: "pipe",
          timeout: 30_000,
        }),
      ).not.toThrow();
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("serializes an immutable evidence manifest", () => {
    const manifest = policy.manifest();
    expect(manifest).toMatchObject({
      version: 1,
      projectRoot: root,
      projectDirs: [root],
      nodeTransformPackages: ["explicit-lib", "shared-lib", "ecosystem-lib"],
      runtimeTransformAugmentations: ["preset-pass-through-modules"],
    });
    expect(manifest.rules.map((rule) => rule.reason)).toEqual([
      "react-native-core",
      "explicit-transform",
      "ecosystem-detected",
      "runtime-transform",
      "project-source",
      "test-entry",
      "identity-sensitive-runtime",
      "test-runtime",
    ]);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.rules)).toBe(true);
  });

  it("round-trips the worker manifest and explains the effective policy", () => {
    const serialized = JSON.stringify(policy.manifest());
    expect(parseNativeOwnershipManifest(serialized)).toMatchObject({
      version: 1,
      enforcement: "enforced",
      projectRoot: root,
    });
    expect(formatNativeOwnershipManifest(serialized)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Vite / reset per file"),
        expect.stringContaining("Node / worker resident: react-native"),
        expect.stringContaining("explicit-lib"),
        expect.stringContaining("preset-pass-through-modules"),
      ]),
    );
  });

  it("reports inline-all as an ownership override instead of claiming enforcement", () => {
    const manifest = createNativeOwnershipPolicy({
      projectRoot: "/repo",
      serverDepsInlineAll: true,
    }).manifest();
    expect(manifest.enforcement).toBe("overridden-by-inline-all");
    expect(formatNativeOwnershipManifest(manifest).at(-1)).toMatch(
      /graph uniqueness is not guaranteed/,
    );
  });

  it("rejects corrupt and future worker manifests without throwing", () => {
    expect(parseNativeOwnershipManifest("not-json")).toBeNull();
    expect(parseNativeOwnershipManifest(JSON.stringify({ version: 2 }))).toBeNull();
    expect(formatNativeOwnershipManifest("not-json")).toEqual([
      "ownership manifest unavailable or invalid",
    ]);
  });

  it("composes transform ownership with identity-sensitive reset lifetime", () => {
    const composed = createNativeOwnershipPolicy({
      projectRoot: "/repo",
      explicitTransforms: ["@testing-library/react-native"],
    }).decideFile("/repo/node_modules/@testing-library/react-native/build/index.js");

    expect(composed).toMatchObject({
      owner: "node",
      transform: "native-babel",
      reset: "worker-resident",
      reason: "explicit-transform",
      reasons: ["explicit-transform", "identity-sensitive-runtime"],
    });
  });

  it("turns actual wrong-graph observations into structured conflicts", () => {
    expect(findNativeOwnershipConflict(policy, "/repo/app/src/button.tsx", "node")).toMatchObject({
      code: "NATIVE_MODULE_OWNER_CONFLICT",
      observedOwner: "node",
      expectedOwner: "vite",
      decision: { reason: "project-source", transform: "vite" },
    });
    expect(
      findNativeOwnershipConflict(policy, "/repo/app/node_modules/ecosystem-lib/index.js", "vite"),
    ).toMatchObject({
      observedOwner: "vite",
      expectedOwner: "node",
      decision: { reason: "ecosystem-detected", transform: "native-babel" },
    });
  });

  it("does not fabricate conflicts for correct, delegated, or overridden observations", () => {
    expect(findNativeOwnershipConflict(policy, "/repo/app/src/button.tsx", "vite")).toBeNull();
    expect(
      findNativeOwnershipConflict(policy, "/repo/app/node_modules/plain-lib/index.js", "node"),
    ).toBeNull();
    const overridden = createNativeOwnershipPolicy({
      projectRoot: "/repo/app",
      ecosystemPackages: ["ecosystem-lib"],
      serverDepsInlineAll: true,
    });
    expect(
      findNativeOwnershipConflict(
        overridden,
        "/repo/app/node_modules/ecosystem-lib/index.js",
        "vite",
      ),
    ).toBeNull();
  });

  it("keeps ownership project-scoped rather than first-caller-wins", () => {
    const projectA = createNativeOwnershipPolicy({
      projectRoot: "/repo/a",
      explicitTransforms: ["only-a"],
    });
    const projectB = createNativeOwnershipPolicy({
      projectRoot: "/repo/b",
      explicitTransforms: ["only-b"],
    });
    const aFile = "/repo/a/node_modules/only-a/index.js";
    expect(projectA.decideFile(aFile).owner).toBe("node");
    expect(projectB.decideFile(aFile).owner).toBe("vitest-default");
    expect(projectA.nodeTransformPackages).toEqual(["only-a"]);
    expect(projectB.nodeTransformPackages).toEqual(["only-b"]);
  });

  it("detects Vitest inline rules that take precedence over Node ownership", () => {
    expect(findNativeInlineConflicts(policy, true)).toEqual(["*"]);
    expect(findNativeInlineConflicts(policy, ["ecosystem-lib"])).toEqual(["ecosystem-lib"]);
    expect(findNativeInlineConflicts(policy, [/node_modules\/explicit-lib\//])).toEqual([
      "explicit-lib",
    ]);
    expect(findNativeInlineConflicts(policy, ["@react-native"])).toEqual(["@react-native/*"]);
    expect(findNativeInlineConflicts(policy, ["plain-lib"])).toEqual([]);
  });
});

describe("worker reconstruction", () => {
  it("rebuilds the same runtime matcher from the serialized transform list", () => {
    const policy = createNativeOwnershipPolicy({
      projectRoot: "/repo",
      runtimeTransforms: ["@scope/native-lib"],
    });
    const file = "/repo/node_modules/@scope/native-lib/src/index.tsx";
    expect(policy.matchesNodeTransformedFile(file)).toBe(true);
    expect(policy.decideFile(file)).toMatchObject({
      owner: "node",
      reason: "runtime-transform",
    });
  });
});
