/**
 * Expo's winter runtime is installed by the native setup file (globals.mjs
 * installExpoRuntime) only when Node compiles `expo` for the project: the rule the
 * require hooks apply to every package (ownership.mjs matchesNodeTransformedFile).
 *
 * SDK 58 publishes `build/winter/*.js` as ES module syntax in a package without
 * `"type": "module"`, so Node can run it only once the engine compiles it. A project
 * where `expo` resolves without being one the engine compiles (a hoisted workspace with
 * an Expo app beside it, a library whose expo-* devDependencies pull `expo` in as a
 * peer) loaded it uncompiled, and every test file failed in the setup file.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs
import { installExpoRuntime } from "../src/native/globals.mjs";
// @ts-expect-error — runtime .mjs
import { createNativeOwnershipPolicy } from "../src/native/ownership.mjs";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";

const MARKER = "__vn_test_expo_runtime_loaded";
const g = globalThis as Record<string, unknown>;

/** A project where `expo` (SDK 58's layout) resolves; the runtime records it ran. */
function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-runtime-")));
  const expo = path.join(root, "node_modules", "expo");
  fs.mkdirSync(path.join(expo, "build", "winter"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"app"}');
  fs.writeFileSync(
    path.join(expo, "package.json"),
    '{"name":"expo","version":"58.0.0","main":"build/Expo.js"}',
  );
  fs.writeFileSync(path.join(expo, "build", "Expo.js"), "");
  fs.writeFileSync(
    path.join(expo, "build", "winter", "index.js"),
    `globalThis.${MARKER} = (globalThis.${MARKER} ?? 0) + 1;`,
  );
  return root;
}

const roots: string[] = [];
afterEach(() => {
  delete g[MARKER];
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const compilesFor = (root: string, runtimeTransforms: string[]) =>
  createNativeOwnershipPolicy({ projectRoot: root, runtimeTransforms }).matchesNodeTransformedFile;

describe("Expo's runtime follows Node ownership of expo", () => {
  it("is not installed when Node does not compile expo for the project", () => {
    const root = project();
    roots.push(root);
    installExpoRuntime(root, compilesFor(root, []));
    expect(g[MARKER], "Expo's runtime ran for a project that does not compile expo").toBe(
      undefined,
    );
  });

  it("is installed when Node compiles expo for the project", () => {
    const root = project();
    roots.push(root);
    installExpoRuntime(root, compilesFor(root, ["expo"]));
    expect(g[MARKER]).toBe(1);
  });

  it("throws when it is not given the compile rule, rather than skipping the runtime", () => {
    const root = project();
    roots.push(root);
    expect(() => installExpoRuntime(root, undefined)).toThrow(TypeError);
    expect(g[MARKER]).toBe(undefined);
  });

  it("asks about the runtime file it would load", () => {
    const root = project();
    roots.push(root);
    const asked: string[] = [];
    installExpoRuntime(root, (file: string) => {
      asked.push(file);
      return false;
    });
    expect(asked).toEqual([path.join(root, "node_modules", "expo", "build", "winter", "index.js")]);
  });
});

// The run's own rule end to end: the packages detection gives the project, compiled by the
// policy the require hooks build from them.
describe("Expo's runtime in workspace and install shapes", () => {
  const write = (file: string, json: unknown) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json));
  };
  /** expo 58's layout at `dir`, its runtime recording that it ran. */
  const expoAt = (dir: string) => {
    write(path.join(dir, "package.json"), {
      name: "expo",
      version: "58.0.0",
      main: "build/Expo.js",
      peerDependencies: { "react-native": "*" },
    });
    fs.mkdirSync(path.join(dir, "build", "winter"), { recursive: true });
    fs.writeFileSync(path.join(dir, "build", "Expo.js"), "");
    fs.writeFileSync(
      path.join(dir, "build", "winter", "index.js"),
      `globalThis.${MARKER} = (globalThis.${MARKER} ?? 0) + 1;`,
    );
  };
  const tmp = () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-shape-")));
    roots.push(root);
    return root;
  };
  // No preset active: the native engine applies the expo preset only when asked.
  const detected = (root: string) => detectEcosystemPackages(root, [], [], [], []);
  const installsRuntime = (root: string) => {
    delete g[MARKER];
    installExpoRuntime(root, compilesFor(root, detected(root)));
    return g[MARKER] === 1;
  };

  it("hoisted workspace: the Expo app gets the runtime, the package beside it does not", () => {
    const ws = tmp();
    write(path.join(ws, "package.json"), {
      name: "ws",
      private: true,
      workspaces: ["apps/*", "packages/*"],
    });
    expoAt(path.join(ws, "node_modules", "expo"));
    write(path.join(ws, "node_modules", "react-native", "package.json"), {
      name: "react-native",
      version: "0.88.0",
    });
    write(path.join(ws, "apps", "app", "package.json"), {
      name: "app",
      dependencies: { expo: "*", "react-native": "*" },
    });
    write(path.join(ws, "packages", "lib", "package.json"), {
      name: "lib",
      dependencies: { "react-native": "*" },
    });
    expect(installsRuntime(path.join(ws, "apps", "app"))).toBe(true);
    expect(installsRuntime(path.join(ws, "packages", "lib"))).toBe(false);
  });

  it("pnpm's isolated layout: a project declaring expo gets the runtime through the store link", () => {
    const root = tmp();
    write(path.join(root, "package.json"), {
      name: "app",
      dependencies: { expo: "*", "react-native": "*" },
    });
    const store = path.join(root, "node_modules", ".pnpm", "expo@58.0.0", "node_modules", "expo");
    expoAt(store);
    fs.symlinkSync(store, path.join(root, "node_modules", "expo"), "dir");
    expect(installsRuntime(root)).toBe(true);
  });

  it("a project that declares a package depending on expo gets the runtime", () => {
    const root = tmp();
    write(path.join(root, "package.json"), {
      name: "app",
      dependencies: { "museum-router": "*", "react-native": "*" },
    });
    expoAt(path.join(root, "node_modules", "expo"));
    write(path.join(root, "node_modules", "museum-router", "package.json"), {
      name: "museum-router",
      version: "1.0.0",
      dependencies: { expo: "*" },
      peerDependencies: { "react-native": "*" },
    });
    expect(detected(root)).toContain("expo");
    expect(installsRuntime(root)).toBe(true);
  });

  it("a library whose expo-* devDependency pulls expo in as a peer does not get the runtime", () => {
    const root = tmp();
    write(path.join(root, "package.json"), {
      name: "lib",
      peerDependencies: { "react-native": "*" },
      devDependencies: { "expo-constants": "*", "react-native": "*" },
    });
    expoAt(path.join(root, "node_modules", "expo"));
    write(path.join(root, "node_modules", "expo-constants", "package.json"), {
      name: "expo-constants",
      version: "58.0.0",
      peerDependencies: { expo: "*", "react-native": "*" },
    });
    expect(detected(root)).toContain("expo-constants");
    expect(detected(root)).not.toContain("expo");
    expect(installsRuntime(root)).toBe(false);
  });
});

// The setup file passes installRequireHooks' own answer to installExpoRuntime. Under the
// hot runtime the worker installs the hooks first and the setup file's call is served
// by the updater, which must answer with the list it was given.
describe("the require hooks' compile rule, as installRequireHooks returns it", () => {
  it("answers for the list of each call, the first and a later one", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-hook-compiles-")));
    roots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"app"}');
    const hooks = pathToFileURL(path.resolve(import.meta.dirname, "../src/native/hooks.mjs")).href;
    const source = `
import { installRequireHooks } from ${JSON.stringify(hooks)};
const root = ${JSON.stringify(root)};
const expo = root + "/node_modules/expo/build/winter/index.js";
const other = root + "/node_modules/other/index.js";
const first = installRequireHooks(root, ["expo"]);
const before = [first(expo), first(other)];
const later = installRequireHooks(root, ["other"]);
// The same list again: the updater keeps the matcher and still answers with the rule.
const unchanged = installRequireHooks(root, ["other"]);
process.stdout.write(JSON.stringify([...before, later(expo), later(other), first(expo), typeof unchanged, unchanged(other)]));
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
      timeout: 10_000,
    });
    expect(child.stderr).toBe("");
    // One matcher, rebuilt by the later call: `first` then answers for the current list too.
    expect(JSON.parse(child.stdout)).toEqual([true, false, false, true, false, "function", true]);
  });
});
