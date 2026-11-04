// A setup file is an entry Vitest runs in Vite (it inlines `test.setupFiles` ahead of
// every external pattern), so the ownership policy must give it to Vite even when it
// sits inside a package the policy gives to Node: here a sibling workspace library that
// declares react-native, linked into the app's node_modules from outside any
// node_modules. The library's own source stays Node-owned.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";
import {
  createNativeOwnershipPolicy,
  findNativeOwnershipConflict,
  parseNativeOwnershipManifest,
} from "../src/native/ownership.mjs";
import { reactNative, setupEntryFiles } from "../src/plugin.js";
import { runPluginConfig } from "./plugin-config.js";

const here = path.resolve(import.meta.dirname, "..");
const made: string[] = [];
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});

// Each workspace below has a node_modules of its own, so its registry cache is empty
// and a config call would compile React Native's registry in a child process (about
// 2 s each, and many times that on a loaded machine). Ownership does not depend on the
// registry, so it is left out, as VITEST_NATIVE_NO_REGISTRY=1 does for a user.
beforeAll(() => {
  vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/**
 * A workspace: packages/kit (declares react-native, a vitest.setup.ts beside its
 * source) and packages/app, which depends on it. `hoisted` links kit at the workspace
 * root (npm, yarn); otherwise into the app's own node_modules only (pnpm's isolated
 * layout). `exportsManifest` adds `./package.json` to kit's exports map.
 */
function workspace(hoisted: boolean, exportsManifest = true) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-setup-entry-"));
  made.push(root);
  write(
    path.join(root, "package.json"),
    JSON.stringify({ name: "ws", private: true, workspaces: ["packages/*"] }),
  );
  const kit = path.join(root, "packages/kit");
  write(
    path.join(kit, "package.json"),
    JSON.stringify({
      name: "@m/kit",
      version: "1.0.0",
      exports: {
        ".": "./src/index.ts",
        ...(exportsManifest ? { "./package.json": "./package.json" } : {}),
      },
      peerDependencies: { "react-native": "*" },
    }),
  );
  write(path.join(kit, "src/index.ts"), "export const registry = { setupRan: false };\n");
  write(path.join(kit, "vitest.setup.ts"), 'import { registry } from "./src/index";\n');
  const app = path.join(root, "packages/app");
  write(
    path.join(app, "package.json"),
    JSON.stringify({ name: "app", private: true, dependencies: { "@m/kit": "*" } }),
  );
  // The native engine's toolchain, from this repository's install.
  for (const name of ["react-native", "@react-native/babel-preset", "@babel/core"]) {
    const to = path.join(root, "node_modules", name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.symlinkSync(fs.realpathSync(path.join(here, "node_modules", name)), to, "junction");
  }
  const link = path.join(hoisted ? root : app, "node_modules/@m/kit");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(kit, link, "junction");
  return { root, kit, app, setup: path.join(kit, "vitest.setup.ts") };
}

describe.each([
  ["isolated (pnpm)", false],
  ["hoisted (npm, yarn)", true],
])("a sibling workspace library's setup file, %s", (_layout, hoisted) => {
  const { kit, app, setup } = workspace(hoisted);
  const ecosystem = detectEcosystemPackages(app);
  const policy = createNativeOwnershipPolicy({
    projectRoot: app,
    ecosystemPackages: ecosystem,
    projectDirs: [app],
    entryFiles: setupEntryFiles(["../kit/vitest.setup.ts"], app),
  });

  it("keeps the library itself Node-owned", () => {
    expect(ecosystem).toEqual(["@m/kit"]);
    expect(policy.decideFile(path.join(kit, "src/index.ts"))).toMatchObject({
      owner: "node",
      reason: "ecosystem-detected",
    });
  });

  it("gives the setup file to Vite, which is where Vitest runs it", () => {
    expect(policy.decideFile(setup)).toMatchObject({ owner: "vite", reason: "test-entry" });
    expect(findNativeOwnershipConflict(policy, setup, "vite")).toBeNull();
  });

  it("lets the plugin's Vite transform take the setup file, and still refuses the source", async () => {
    const plugin = reactNative({ engine: "native" });
    await runPluginConfig(plugin, {
      root: app,
      test: { setupFiles: ["../kit/vitest.setup.ts"] },
    });
    const transform = (file: string) => plugin.transform?.call({} as never, "export {};", file);
    expect(() => transform(setup)).not.toThrow();
    expect(() => transform(path.join(kit, "src/index.ts"))).toThrow(
      /MODULE_OWNER_CONFLICT|assigns/,
    );
  });

  it("lists the setup file in the manifest workers and diagnostics read", () => {
    const manifest = parseNativeOwnershipManifest(JSON.stringify(policy.manifest()));
    expect(manifest?.entryFiles).toContain(setup);
  });
});

// Before 0.14.0-rc.11 a workspace member was detected only when `<name>/package.json`
// resolved; #406's wider lookup is for installed packages (dependencyDirOf). A member
// whose exports omit ./package.json therefore stays Vite-owned, as on rc.10.
describe.each([
  ["isolated (pnpm)", false],
  ["hoisted (npm, yarn)", true],
])("a workspace library whose exports omit ./package.json, %s", (_layout, hoisted) => {
  const { kit, app, setup } = workspace(hoisted, false);

  it("is not detected, so Vite owns its source and its setup file", async () => {
    expect(detectEcosystemPackages(app)).toEqual([]);
    const plugin = reactNative({ engine: "native" });
    await runPluginConfig(plugin, {
      root: app,
      test: { setupFiles: ["../kit/vitest.setup.ts"] },
    });
    const transform = (file: string) => plugin.transform?.call({} as never, "export {};", file);
    expect(() => transform(setup)).not.toThrow();
    expect(() => transform(path.join(kit, "src/index.ts"))).not.toThrow();
  });
});

describe("setupEntryFiles", () => {
  it("resolves from the run root, by the spelling given and by the real path", () => {
    const { kit, app } = workspace(false);
    const linkedSetup = path.join(app, "node_modules/@m/kit/vitest.setup.ts");
    const real = path.join(kit, "vitest.setup.ts");
    const files = setupEntryFiles([linkedSetup, "./missing.ts", 3], app);
    // Node's real-path spelling and the OS's differ on Windows (8.3 short names, #399);
    // both are listed, so check each form rather than one spelling.
    for (const expected of [
      linkedSetup,
      fs.realpathSync(real),
      fs.realpathSync.native(real),
      path.join(app, "missing.ts"),
    ]) {
      expect(files).toContain(expected);
    }
    expect(setupEntryFiles(undefined, app)).toEqual([]);
  });

  it("leaves a setup file under node_modules to the package rules", () => {
    const app = path.resolve("/repo/app");
    const installed = path.join(app, "node_modules/some-lib/jest-setup.js");
    const policy = createNativeOwnershipPolicy({
      projectRoot: app,
      ecosystemPackages: ["some-lib"],
      entryFiles: [installed],
    });
    expect(policy.decideFile(installed)).toMatchObject({
      owner: "node",
      reason: "ecosystem-detected",
    });
  });
});
