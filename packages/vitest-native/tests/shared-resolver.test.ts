// experimental.ownershipModel's shared resolver (src/native/shared-resolver.mjs):
// what it answers, the inputs every realm checks, and the alias semantics it must
// share with Vite's own alias plugin.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  checkResolverInputs,
  conditionsIn,
  createSharedResolver,
  expandResolutionAlias,
  nodeOptionsList,
  ownershipResolverInputs,
  identityKey,
  resolverCounters,
  workerSharedResolver,
  resolverInputsHash,
  serializeResolutionAliases,
} from "../src/native/shared-resolver.mjs";
import { reactNative } from "../src/index.js";
import { runPluginConfig } from "./plugin-config.js";

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

describe("identityKey, the one key for comparing paths across realms", () => {
  it("gives two spellings of one file one key (a symlinked directory)", () => {
    const root = project({ "real/file.js": "" });
    fs.symlinkSync(path.join(root, "real"), path.join(root, "link"), "junction");
    expect(identityKey(path.join(root, "link/file.js"))).toBe(
      identityKey(path.join(root, "real/file.js")),
    );
  });

  it("is Vite's spelling, while the resolver's answers keep Node's", () => {
    const root = project(dual);
    const answer = createSharedResolver(inputsFor(root)).resolve("dual", path.join(root, "a.js"))!;
    expect(answer).toBe(fs.realpathSync(answer));
    expect(identityKey(answer)).toBe(fs.realpathSync.native(answer));
  });

  // Windows spells a directory both `C:\Users\RUNNER~1\…` (the 8.3 short name the TEMP
  // variable often uses on CI) and `C:\Users\runneradmin\…`.
  it.runIf(process.platform === "win32")("gives a Windows 8.3 short name its long key", () => {
    const short = process.env.TEMP ?? os.tmpdir();
    expect(identityKey(short)).toBe(fs.realpathSync.native(short));
    expect(identityKey(short)).not.toMatch(/~\d/);
  });

  it("falls back to the resolved path for a file that does not exist", () => {
    expect(identityKey("no/such/file")).toBe(path.resolve("no/such/file"));
  });
});

describe("one resolver per worker", () => {
  const root = project(dual);
  const inputs = inputsFor(root);
  const from = path.join(root, "app.js");

  it("shares one core between the CommonJS and ESM realms: one realm's answer is the other's hit", () => {
    const cjs = workerSharedResolver(inputs, "test-cjs");
    const esm = workerSharedResolver(inputs, "test-esm");
    const target = path.join(root, "node_modules/dual/cjs.cjs");
    expect(cjs.resolve("dual", from)).toBe(target);
    expect(cjs.counters.misses).toBe(1);
    expect(esm.resolve("dual", from)).toBe(target);
    expect(esm.counters).toMatchObject({ calls: 1, hits: 1, misses: 0, manifestReads: 0 });
  });

  it("resolves afresh what a realm forgot (its file was found gone)", () => {
    const cjs = workerSharedResolver(inputs, "test-cjs-forget");
    cjs.resolve("dual", from);
    cjs.resolve("dual", from);
    const held = { ...cjs.counters };
    cjs.forget("dual", from);
    cjs.resolve("dual", from);
    expect(cjs.counters.hits - held.hits).toBe(0);
    expect(cjs.counters.misses - held.misses).toBe(1);
  });

  it("does not hand one realm a file another realm held that is gone since", () => {
    const tree = project({
      "node_modules/l/package.json": JSON.stringify({ name: "l", exports: "./n.js" }),
      "node_modules/l/n.js": "",
      "node_modules/c/node_modules/l/package.json": JSON.stringify({
        name: "l",
        exports: "./n.js",
      }),
      "node_modules/c/node_modules/l/n.js": "",
      "node_modules/c/index.js": "",
    });
    const own = inputsFor(tree);
    const consumer = path.join(tree, "node_modules/c/index.js");
    const esm = workerSharedResolver(own, "test-stale-esm");
    const cjs = workerSharedResolver(own, "test-stale-cjs");
    expect(esm.resolve("l", consumer)).toBe(path.join(tree, "node_modules/c/node_modules/l/n.js"));
    fs.rmSync(path.join(tree, "node_modules/c/node_modules"), { recursive: true });
    cjs.forget("unrelated", consumer); // a stale check elsewhere clears the directory caches
    expect(cjs.resolve("l", consumer)).toBe(path.join(tree, "node_modules/l/n.js"));
  });

  it("looks in NODE_PATH for the CommonJS realms only, as Node does", () => {
    const tree = project({
      "np/glob-lib/package.json": JSON.stringify({ name: "glob-lib", exports: "./i.js" }),
      "np/glob-lib/i.js": "",
      "app/a.js": "",
    });
    const before = process.env.NODE_PATH;
    process.env.NODE_PATH = path.join(tree, "np");
    (Module as unknown as { _initPaths(): void })._initPaths();
    try {
      const requester = path.join(tree, "app/a.js");
      const own = inputsFor(tree);
      expect(
        createSharedResolver(own, { globalFolders: true }).resolve("glob-lib", requester),
      ).toBe(path.join(tree, "np/glob-lib/i.js"));
      expect(createSharedResolver(own).resolve("glob-lib", requester)).toBe(null);
    } finally {
      if (before === undefined) delete process.env.NODE_PATH;
      else process.env.NODE_PATH = before;
      (Module as unknown as { _initPaths(): void })._initPaths();
    }
  });

  it("looks a package directory up once per requesting directory, whatever the subpath", () => {
    const tree = project({
      "node_modules/many/package.json": JSON.stringify({
        name: "many",
        exports: { "./a": "./a.js", "./b": "./b.js", "./c": "./c.js" },
      }),
      "node_modules/many/a.js": "",
      "node_modules/many/b.js": "",
      "node_modules/many/c.js": "",
      "src/deep/x.js": "",
    });
    const resolver = createSharedResolver(inputsFor(tree));
    const requester = path.join(tree, "src/deep/x.js");
    resolver.resolve("many/a", requester);
    const probes = vi.spyOn(fs, "existsSync");
    try {
      resolver.resolve("many/b", requester);
      resolver.resolve("many/c", requester);
      expect(probes).not.toHaveBeenCalled();
    } finally {
      probes.mockRestore();
    }
  });

  // On a case-insensitive disk a directory can be reached under another case. Node's
  // module cache keys by fs.realpathSync, which keeps the case it was given; the native
  // real path (identityKey, Vite's spelling) gives the on-disk case. Answers must be
  // Node's spelling, or Node loads the file twice.
  const caseInsensitive = (() => {
    const probe = fs.mkdtempSync(path.join(os.tmpdir(), "vn-case-"));
    try {
      return fs.existsSync(probe.toUpperCase()) && probe !== probe.toUpperCase();
    } finally {
      fs.rmSync(probe, { recursive: true, force: true });
    }
  })();
  it.runIf(caseInsensitive)(
    "answers in Node's spelling for a requester spelled in another case",
    () => {
      const tree = project({
        "Lib/node_modules/cased/package.json": JSON.stringify({ name: "cased", exports: "./i.js" }),
        "Lib/node_modules/cased/i.js": "",
        "Lib/x.js": "",
      });
      const answer = createSharedResolver(inputsFor(tree)).resolve(
        "cased",
        path.join(tree, "LIB/x.js"),
      )!;
      expect(answer).toBe(fs.realpathSync(path.join(tree, "LIB/node_modules/cased/i.js")));
      expect(answer).not.toBe(identityKey(answer));
    },
  );

  it("keeps separate cores for separate inputs", () => {
    const a = workerSharedResolver(inputs, "test-core-a");
    const b = workerSharedResolver({ ...inputs, platform: "android" }, "test-core-b");
    a.resolve("dual", from);
    b.resolve("dual", from);
    expect(b.counters.misses).toBe(1);
  });
});

describe("on Vite's side", () => {
  // Vite's alias plugin runs before any plugin's resolveId, so the request arrives with
  // the project's string and RegExp aliases applied: `lib` → `lib/mock` must not become
  // `lib/mock/mock`. tsconfig `paths`, which Vite applies only after, still apply.
  const root = project({
    "node_modules/lib/package.json": JSON.stringify({
      name: "lib",
      exports: { ".": "./index.js", "./mock": "./mock.js", "./mock/mock": "./mock-mock.js" },
    }),
    "node_modules/lib/index.js": "",
    "node_modules/lib/mock.js": "",
    "node_modules/lib/mock-mock.js": "",
    "src/util.ts": "",
    "src/feature.ts": "",
  });
  const inputs = inputsFor(root, {
    aliases: [
      ["lib", "lib/mock"],
      [{ prefix: "@/" }, `${root}/src`],
      [{ exact: "@feature" }, `${root}/src/feature.ts`],
    ],
  });
  const from = path.join(root, "app.ts");

  it("applies Vite's aliases once: the request arrives expanded", () => {
    const vite = createSharedResolver(inputs, { viteAliasesApplied: true });
    expect(vite.resolve("lib/mock", from)).toBe(path.join(root, "node_modules/lib/mock.js"));
    // Node's realms get the request as written and expand it, to the same file.
    expect(createSharedResolver(inputs).resolve("lib", from)).toBe(
      path.join(root, "node_modules/lib/mock.js"),
    );
  });

  it("still applies tsconfig paths, which Vite applies after the plugins", () => {
    const vite = createSharedResolver(inputs, { viteAliasesApplied: true });
    expect(vite.resolve("@/util", from)).toBe(path.join(root, "src/util.ts"));
    // A tsconfig path without a wildcard matches the whole request only.
    expect(vite.resolve("@feature", from)).toBe(path.join(root, "src/feature.ts"));
    expect(vite.resolve("@feature/x", from)).toBe(null);
  });
});

describe("the shadow file", () => {
  it("is recreated when the cache directory was cleared", () => {
    const root = project({ "node_modules/x/package.json": "{}" });
    const shadowFile = path.join(root, "cleared", "ownership-shadow", "h.jsonl");
    createSharedResolver(inputsFor(root), { shadowFile }).shadow("x", undefined, "/a", "/b");
    expect(JSON.parse(fs.readFileSync(shadowFile, "utf8"))).toMatchObject({ request: "x" });
  });
});

describe("a realm with the flag on and no inputs", () => {
  const inputs = inputsFor("/p");
  const hash = resolverInputsHash(inputs);

  it("fails by name instead of resolving as if the flag were off", () => {
    expect(() => ownershipResolverInputs({ ownershipModel: "resolver" }, "test")).toThrow(
      expect.objectContaining({ code: "RESOLVER_INPUTS_MISSING" }),
    );
  });

  it("builds nothing with the flag off, and the checked record with it on", () => {
    expect(ownershipResolverInputs({ resolverInputs: inputs, resolverInputsHash: hash }, "t")).toBe(
      null,
    );
    expect(ownershipResolverInputs(null, "test")).toBe(null);
    expect(
      ownershipResolverInputs(
        { ownershipModel: "resolver", resolverInputs: inputs, resolverInputsHash: hash },
        "test",
      ),
    ).toBe(inputs);
  });
});

describe("the Vite side under the flag", () => {
  // configureVitest records the inputs for the project's root; resolveId then asks for
  // the requesting environment's root.
  const configured = async (configRoot: string) => {
    const plugin = reactNative({
      engine: "native",
      experimental: { ownershipModel: "resolver" },
    }) as any;
    const config = await runPluginConfig(plugin, { root: configRoot });
    await plugin.configResolved?.({ root: configRoot });
    const vitestProject = {
      config: { root: configRoot, setupFiles: config.test.setupFiles, env: { ...config.test.env } },
    };
    await plugin.configureVitest({
      vitest: { config: { cliOptions: {} } },
      project: vitestProject,
    });
    return (root: string) =>
      plugin.resolveId.call({ environment: { config: { root } } }, "dual-nope-not-installed");
  };

  it("finds the project's resolver under another spelling of its root", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-resolver-spelling-"));
    roots.push(dir);
    const link = path.join(dir, "link");
    fs.symlinkSync(process.cwd(), link, "junction");
    const resolve = await configured(link);
    const calls = () => resolverCounters()?.vite?.calls ?? 0;
    const before = calls();
    expect(() => resolve(process.cwd())).not.toThrow();
    expect(() => resolve(link)).not.toThrow();
    // The project's own resolver answered both, not "no resolver, flag off in Vite".
    expect(calls()).toBe(before + 2);
  });

  it("forgets what Vite held when a watched file is added or removed", async () => {
    const plugin = reactNative({
      engine: "native",
      experimental: { ownershipModel: "resolver" },
    }) as any;
    const config = await runPluginConfig(plugin, { root: process.cwd() });
    // Vite creates the server, and calls configureServer, before Vitest calls
    // configureVitest, where the resolver is created.
    const handlers = new Map<string, () => void>();
    plugin.configureServer({
      watcher: { on: (event: string, fn: () => void) => handlers.set(event, fn) },
    });
    await plugin.configureVitest({
      vitest: { config: { cliOptions: {} } },
      project: {
        config: {
          root: process.cwd(),
          setupFiles: config.test.setupFiles,
          env: { ...config.test.env },
        },
      },
    });
    expect([...handlers.keys()].sort()).toEqual(["add", "addDir", "unlink", "unlinkDir"]);
    // An installed package the resolver answers and holds.
    const from = path.join(process.cwd(), "app.ts");
    const resolve = () =>
      plugin.resolveId.call(
        { environment: { config: { root: process.cwd() } } },
        "magic-string",
        from,
      );
    const counts = () => ({ ...resolverCounters()!.vite });
    resolve();
    const first = counts();
    resolve();
    const repeat = counts();
    expect(repeat.hits - first.hits).toBe(1);
    handlers.get("add")!();
    resolve();
    const afterAdd = counts();
    expect(afterAdd.misses - repeat.misses).toBe(1);
  });

  it("does not apply an alias again to the request Vite's alias plugin expanded", async () => {
    const plugin = reactNative({
      engine: "native",
      experimental: { ownershipModel: "resolver" },
    }) as any;
    const config = await runPluginConfig(plugin, {
      root: process.cwd(),
      resolve: { alias: { "magic-string": "magic-string/package.json" } },
    });
    await plugin.configureVitest({
      vitest: { config: { cliOptions: {} } },
      project: {
        config: {
          root: process.cwd(),
          setupFiles: config.test.setupFiles,
          env: { ...config.test.env },
        },
      },
    });
    const unresolved = () => resolverCounters()?.vite?.fallbacks.unresolved ?? 0;
    const before = unresolved();
    // What reaches resolveId after Vite's alias plugin ran: the replacement.
    const id = plugin.resolveId.call(
      { environment: { config: { root: process.cwd() } } },
      "magic-string/package.json",
      path.join(process.cwd(), "app.ts"),
    );
    expect(id).toMatch(/magic-string[\\/]package\.json$/);
    // Applied again it would be magic-string/package.json/package.json: not installed.
    expect(unresolved()).toBe(before);
  });

  it("never answers with another project's resolver", async () => {
    const resolve = await configured(process.cwd());
    expect(() => resolve(os.tmpdir())).toThrow(
      expect.objectContaining({ code: "RESOLVER_INPUTS_MISSING" }),
    );
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
