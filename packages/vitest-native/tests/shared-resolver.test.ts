// experimental.ownershipModel's shared resolver (src/native/shared-resolver.mjs):
// what it answers, the inputs every realm checks, and the alias semantics it must
// share with Vite's own alias plugin.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkResolverInputs,
  conditionsIn,
  createSharedResolver,
  expandResolutionAlias,
  nodeOptionsList,
  resolverInputsHash,
  serializeResolutionAliases,
} from "../src/native/shared-resolver.mjs";
// @ts-expect-error — runtime .mjs, no types
import { registryKey } from "../src/native/registry.mjs";

const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-shared-resolver-")));
  roots.push(root);
  for (const [file, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), body);
  }
  return root;
}

const dual = {
  "node_modules/dual/package.json": JSON.stringify({
    name: "dual",
    exports: {
      ".": { import: "./esm.mjs", require: "./cjs.cjs" },
      "./sub": { "react-native": "./sub-native.js", default: "./sub.js" },
    },
  }),
  "node_modules/dual/esm.mjs": "",
  "node_modules/dual/cjs.cjs": "",
  "node_modules/dual/sub.js": "",
  "node_modules/dual/sub-native.js": "",
};

const inputsFor = (root: string, extra: object = {}) => ({
  projectRoot: root,
  platform: "ios",
  conditions: ["node", "require"],
  ...extra,
});

describe("the shared resolver", () => {
  it("gives every realm the require build of a dual-export package", () => {
    const root = project({ ...dual, "package.json": "{}" });
    const resolver = createSharedResolver(inputsFor(root), { realm: "t-dual" });
    expect(resolver.resolve("dual", path.join(root, "app.ts"))).toBe(
      path.join(root, "node_modules/dual/cjs.cjs"),
    );
    // `react-native` is matched first, as Metro and Jest's preset match it.
    expect(resolver.resolve("dual/sub", path.join(root, "app.ts"))).toBe(
      path.join(root, "node_modules/dual/sub-native.js"),
    );
  });

  it("answers from the requester's own directory, so a nested copy stays its own", () => {
    const root = project({
      ...dual,
      "node_modules/reader/package.json": JSON.stringify({ name: "reader" }),
      "node_modules/reader/node_modules/dual/package.json": JSON.stringify({
        name: "dual",
        exports: { ".": { require: "./v2.cjs" } },
      }),
      "node_modules/reader/node_modules/dual/v2.cjs": "",
    });
    const resolver = createSharedResolver(inputsFor(root), { realm: "t-nested" });
    expect(resolver.resolve("dual", path.join(root, "node_modules/reader/index.js"))).toBe(
      path.join(root, "node_modules/reader/node_modules/dual/v2.cjs"),
    );
    expect(resolver.resolve("dual", path.join(root, "app.ts"))).toBe(
      path.join(root, "node_modules/dual/cjs.cjs"),
    );
  });

  it("takes the react-native main field of a package without exports", () => {
    const root = project({
      "node_modules/legacy/package.json": JSON.stringify({
        name: "legacy",
        main: "./web.js",
        "react-native": "./native",
      }),
      "node_modules/legacy/web.js": "",
      "node_modules/legacy/native.js": "",
    });
    const resolver = createSharedResolver(inputsFor(root), { realm: "t-field" });
    expect(resolver.resolve("legacy", path.join(root, "app.ts"))).toBe(
      path.join(root, "node_modules/legacy/native.js"),
    );
  });

  it("reads a package manifest once, however many directories ask", () => {
    const root = project({ ...dual });
    const resolver = createSharedResolver(inputsFor(root), { realm: "t-reads", memo: false });
    for (const dir of ["a", "b", "c/d"]) resolver.resolve("dual", path.join(root, dir, "x.ts"));
    expect(resolver.counters.manifestReads).toBe(1);
  });

  it("finds a nearer copy installed since, once cleared (the Vite side clears on watch add)", () => {
    const root = project({ ...dual });
    const resolver = createSharedResolver(inputsFor(root), { realm: "t-clear" });
    const from = path.join(root, "app/src/a.ts");
    expect(resolver.resolve("dual", from)).toBe(path.join(root, "node_modules/dual/cjs.cjs"));
    fs.mkdirSync(path.join(root, "app/node_modules/dual"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "app/node_modules/dual/package.json"),
      JSON.stringify({ name: "dual", exports: { require: "./near.cjs" } }),
    );
    fs.writeFileSync(path.join(root, "app/node_modules/dual/near.cjs"), "");
    // Held until cleared, as Node holds its own resolutions.
    expect(resolver.resolve("dual", from)).toBe(path.join(root, "node_modules/dual/cjs.cjs"));
    resolver.clear();
    expect(resolver.resolve("dual", from)).toBe(path.join(root, "app/node_modules/dual/near.cjs"));
  });

  it("declines what another owner answers", () => {
    const root = project({});
    const resolver = createSharedResolver(inputsFor(root), { realm: "t-decline" });
    for (const request of ["react-native", "vitest", "node:fs", "fs", "./x", "/abs"]) {
      expect(resolver.resolve(request, path.join(root, "a.ts"))).toBeNull();
    }
    expect(resolver.counters.calls).toBe(0);
  });

  it("counts an error as a named fallback instead of failing quietly", () => {
    const root = project({ "node_modules/broken/package.json": "{ nope" });
    const resolver = createSharedResolver(inputsFor(root), { realm: "t-error" });
    expect(resolver.resolve("broken", path.join(root, "a.ts"))).toBeNull();
    expect(resolver.counters.fallbacks).toEqual({ error: 1 });
    expect(resolver.counters.errors[0]).toMatch(/^broken from /);
  });

  it("keeps the link under --preserve-symlinks, and the real file otherwise", () => {
    const root = project({ "real/dual/package.json": dual["node_modules/dual/package.json"] });
    fs.writeFileSync(path.join(root, "real/dual/cjs.cjs"), "");
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.symlinkSync(path.join(root, "real/dual"), path.join(root, "node_modules/dual"), "junction");
    const from = path.join(root, "a.ts");
    expect(createSharedResolver(inputsFor(root), { realm: "t-real" }).resolve("dual", from)).toBe(
      path.join(root, "real/dual/cjs.cjs"),
    );
    expect(
      createSharedResolver(inputsFor(root, { preserveSymlinks: true }), {
        realm: "t-link",
      }).resolve("dual", from),
    ).toBe(path.join(root, "node_modules/dual/cjs.cjs"));
  });
});

describe("each realm checks the inputs it resolves from", () => {
  const inputs = inputsFor("/p", { conditions: ["require", "node", "development"] });

  it("passes when Node applies the same conditions, in any order", () => {
    expect(() =>
      checkResolverInputs(inputs, resolverInputsHash(inputs), "test", {
        nodeConditions: ["development", "node", "require", "react-native"],
      }),
    ).not.toThrow();
  });

  it("fails by name on a condition only one side has", () => {
    expect(() =>
      checkResolverInputs(inputs, resolverInputsHash(inputs), "test", {
        nodeConditions: ["require", "node", "development", "foo"],
      }),
    ).toThrow(expect.objectContaining({ code: "RESOLVER_INPUT_MISMATCH" }));
  });

  it("fails by name on an edited copy", () => {
    expect(() =>
      checkResolverInputs({ ...inputs, platform: "android" }, resolverInputsHash(inputs), "test"),
    ).toThrow(/different 'hash'/);
  });

  it("reads --conditions in each of Node's spellings", () => {
    expect(conditionsIn(["--conditions", "a", "--conditions=b", "-C", "c", "-C=d", "--x"])).toEqual(
      ["a", "b", "c", "d"],
    );
    expect(conditionsIn(nodeOptionsList(" --conditions=src  --max-old-space-size=1 "))).toEqual([
      "src",
    ]);
  });
});

describe("aliases", () => {
  it("expand exactly as Vite's own alias plugin does", async () => {
    const req = createRequire(path.resolve(import.meta.dirname, "../package.json"));
    const { resolveConfig } = await import(pathToFileURL(req.resolve("vite")).href);
    const aliases = [
      { find: "@", replacement: "/fixture/src" },
      { find: "@/components", replacement: "/fixture/ui" },
      { find: /^#([^/]+)\/(.*)$/, replacement: "/fixture/packages/$1/src/$2" },
      { find: "~/", replacement: "/fixture/app" },
    ];
    const config = await resolveConfig(
      { configFile: false, root: import.meta.dirname, resolve: { alias: aliases } },
      "serve",
    );
    const plugin = config.plugins.find((p: { name: string }) => p.name === "alias");
    const hook =
      typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler;
    const serial = serializeResolutionAliases(aliases, import.meta.dirname).entries;
    const requests = [
      "@/components/Button",
      "@/services/api",
      "#ui/button",
      "#ui/button",
      "~/screens/Home",
      "@scope/package",
      "plain",
    ];
    for (const request of requests) {
      const answer = await hook.call(
        {
          resolve: async (id: string) => ({ id }),
          error: (e: unknown) => {
            throw e;
          },
        },
        request,
        path.join(import.meta.dirname, "index.ts"),
        {},
      );
      const vite = typeof answer === "string" ? answer : (answer?.id ?? request);
      expect(expandResolutionAlias(request, serial), request).toBe(vite);
    }
  });

  it("lists an alias a worker could not apply", () => {
    expect(
      serializeResolutionAliases(
        [{ find: "x", replacement: "/y", customResolver: () => null }],
        "/root",
      ).skipped,
    ).toEqual(["x"]);
  });
});

describe("the registry under the flag", () => {
  const root = project({
    "package.json": "{}",
    "node_modules/react-native/package.json": JSON.stringify({ version: "0.86.0" }),
  });
  const base = { projectRoot: root, platform: "ios", reactNativeVersion: "0.86.0" };

  it("is a different cache entry with the flag on", () => {
    expect(registryKey({ ...base, ownershipModel: "resolver" })).not.toBe(registryKey(base));
  });

  it("keeps the same key as before with the flag off", () => {
    expect(registryKey({ ...base, ownershipModel: undefined })).toBe(registryKey(base));
  });
});
