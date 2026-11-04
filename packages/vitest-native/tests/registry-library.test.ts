import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// The library registry (registry.mjs, buildLibraryRegistry): a library's module graph
// precompiled into one file of lazy factories, layered on React Native's registry.
//
// The fixture is a stand-in react-native with a singleton module, and a library whose
// files require that singleton, a dependency of their own, and a module only a
// function reaches. Each scenario runs in a fresh Node process with both registries
// installed, as a worker installs them.

const fixture = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-reg-library-"));
afterAll(() => fs.rmSync(fixture, { recursive: true, force: true }));

function write(file: string, source: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

const nm = path.join(fixture, "node_modules");
write(path.join(fixture, "package.json"), JSON.stringify({ name: "library-app" }));
write(
  path.join(nm, "react-native", "package.json"),
  JSON.stringify({ name: "react-native", version: "0.0.0" }),
);
write(
  path.join(nm, "react-native", "index.js"),
  `module.exports = { get Singleton() { return require("./Libraries/Singleton"); } };\n`,
);
write(
  path.join(nm, "react-native", "Libraries", "Singleton.js"),
  `globalThis.__rnSingletons = (globalThis.__rnSingletons ?? 0) + 1;\nmodule.exports = { id: globalThis.__rnSingletons };\n`,
);
write(
  path.join(nm, "lib-a", "package.json"),
  JSON.stringify({
    name: "lib-a",
    version: "1.0.0",
    main: "index.js",
    // dep-p is its own; dep-b it shares with the app, as a peer.
    dependencies: { "dep-p": "1.0.0", "dep-q": "1.0.0", "dep-b": "1.0.0" },
    peerDependencies: { "dep-b": "1.0.0" },
  }),
);
write(
  path.join(nm, "lib-a", "index.js"),
  [
    `globalThis.__libRuns = (globalThis.__libRuns ?? 0) + 1;`,
    `const singleton = require("react-native/Libraries/Singleton");`,
    `const { helper } = require("./helper");`,
    `module.exports = { singleton, helper, dep: require("dep-b"), later: () => require("./later"),`,
    `  own: require("dep-p"), data: require("./data.json"), other: require("lib-c"),`,
    `  part: require("dep-q/part") };`,
  ].join("\n"),
);
write(path.join(nm, "lib-a", "helper.js"), `exports.helper = "helper";\n`);
write(path.join(nm, "lib-a", "data.json"), JSON.stringify({ data: true }));
write(
  path.join(nm, "dep-p", "package.json"),
  JSON.stringify({ name: "dep-p", version: "1.0.0", main: "index.js" }),
);
write(path.join(nm, "dep-p", "index.js"), `module.exports = { own: "dep-p" };\n`);
// A dependency lib-a reaches only part of: its entry is never in the registry.
write(
  path.join(nm, "dep-q", "package.json"),
  JSON.stringify({ name: "dep-q", version: "1.0.0", main: "index.js" }),
);
write(path.join(nm, "dep-q", "index.js"), `exports.part = require("./part");\n`);
write(path.join(nm, "dep-q", "part.js"), `module.exports = { part: "dep-q" };\n`);
// A library whose graph cannot be compiled.
write(
  path.join(nm, "lib-broken", "package.json"),
  JSON.stringify({ name: "lib-broken", version: "1.0.0", main: "index.js" }),
);
write(path.join(nm, "lib-broken", "index.js"), `module.exports = require("./bad");\n`);
write(path.join(nm, "lib-broken", "bad.js"), `module.exports = {;\n`);
// A second library entry, which lib-a requires by name.
write(
  path.join(nm, "lib-c", "package.json"),
  JSON.stringify({ name: "lib-c", version: "1.0.0", main: "index.js" }),
);
write(path.join(nm, "lib-c", "index.js"), `module.exports = { other: "lib-c" };\n`);
// A library whose own Jest resolver narrows its files' extensions, as worklets' does
// (native/jest-resolvers.mjs): without it, \`./impl\` is impl.native.js.
write(
  path.join(nm, "react-native-worklets", "package.json"),
  JSON.stringify({ name: "react-native-worklets", version: "1.0.0", main: "index.js" }),
);
write(path.join(nm, "react-native-worklets", "index.js"), `module.exports = require("./impl");\n`);
write(path.join(nm, "react-native-worklets", "impl.js"), `module.exports = "js";\n`);
write(path.join(nm, "react-native-worklets", "impl.native.js"), `module.exports = "native";\n`);
const RESOLVER = [
  `module.exports = (request, options) => options.defaultResolver(request, {`,
  `  ...options,`,
  `  extensions: options.extensions.filter((ext) => !ext.includes("native")),`,
  `});`,
].join("\n");
write(path.join(nm, "react-native-worklets", "jest", "resolver.js"), RESOLVER);
write(
  path.join(nm, "lib-a", "later.js"),
  `globalThis.__laterRuns = (globalThis.__laterRuns ?? 0) + 1;\nmodule.exports = "later";\n`,
);
write(
  path.join(nm, "dep-b", "package.json"),
  JSON.stringify({ name: "dep-b", version: "1.0.0", main: "index.js" }),
);
write(path.join(nm, "dep-b", "index.js"), `module.exports = "dep-b";\n`);

const registry = pathToFileURL(path.resolve(import.meta.dirname, "../src/native/registry.mjs"));

/** Run `body` in a fresh Node process with both registries installed; returns its JSON. */
function run(body: string, { install = true } = {}): any {
  const script = `
    import Module, { createRequire } from "node:module";
    import { buildRegistry, buildLibraryRegistry, installRegistry } from ${JSON.stringify(registry.href)};
    const root = ${JSON.stringify(fixture)};
    const options = { projectRoot: root, platform: "ios", failOnError: true };
    const rnFile = buildRegistry(options);
    const entries = ["lib-a", "lib-c", "react-native-worklets"];
    const libFile = buildLibraryRegistry({ ...options, libraryEntries: entries });
    if (${install}) installRegistry(rnFile, root, undefined, libFile);
    const req = createRequire(root + "/app.js");
    const before = new Set(Object.keys(req.cache));
    // Paths are reported relative to the root, with forward slashes on every platform.
    const rel = (file) => file.slice(root.length + 1).split("\\\\").join("/");
    const added = () => Object.keys(req.cache).filter((k) => !before.has(k)).map(rel);
    const out = await (async () => { ${body} })();
    process.stdout.write(JSON.stringify(out));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: fixture,
      encoding: "utf8",
    }),
  );
}

describe("library registry", () => {
  it("serves the library from the registry, sharing React Native's instances", () => {
    const out = run(`
      const loads = [];
      const load = Module._load;
      Module._load = function (request, ...rest) {
        loads.push(request.startsWith(root) ? rel(request) : request);
        return load.call(this, request, ...rest);
      };
      const lib = req("lib-a");
      Module._load = load;
      const rn = req("react-native");
      return {
        // The library's require of React Native is linked to React Native's registry,
        // not sent back through Node's loader; only its own dependency is.
        loads,
        sameSingleton: lib.singleton === rn.Singleton,
        singletons: globalThis.__rnSingletons,
        helper: lib.helper,
        dep: lib.dep,
        nodeLoaded: added(),
      };
    `);
    expect(out).toEqual({
      // A require of another package (dep-p, lib-c) is linked by path, so a preset
      // shadowing that package applies to it; the registry serves it from there.
      loads: [
        "lib-a",
        "node_modules/dep-b/index.js",
        "node_modules/dep-p/index.js",
        "node_modules/lib-c/index.js",
        "node_modules/dep-q/part.js",
      ],
      sameSingleton: true,
      singletons: 1,
      helper: "helper",
      dep: "dep-b",
      // Only the library's own dependency goes through Node's loader.
      nodeLoaded: ["node_modules/dep-b/index.js"],
    });
  });

  it("resolves a request for any other package once, as Node alone would", () => {
    const out = run(`
      let resolutions = 0;
      const resolve = Module._resolveFilename;
      Module._resolveFilename = function (request, ...rest) {
        if (request === "dep-b") resolutions++;
        return resolve.call(this, request, ...rest);
      };
      req("dep-b");
      return resolutions;
    `);
    expect(out).toBe(1);
  });

  it("requires another package by path without Node resolving it again", () => {
    const out = run(`
      // The worker's preset hooks, with a preset for a package none of this touches.
      globalThis.__vitest_native_preset_mocks = { "some-other-package": null };
      globalThis.__vitest_native_preset_require = (request, file) => Module._load(file, null, false);
      req("lib-a");
      let resolutions = 0;
      const resolve = Module._resolveFilename;
      Module._resolveFilename = function (request, ...rest) {
        resolutions++;
        return resolve.call(this, request, ...rest);
      };
      // Each file runs the library again from a reset registry, as the hot runtime does.
      for (let file = 0; file < 3; file++) {
        globalThis.__vitest_native_registry_reset();
        req("lib-a");
      }
      Module._resolveFilename = resolve;
      return resolutions;
    `);
    // Neither lib-a by name (the registry's own lookup, once per worker) nor its
    // requires of dep-b, dep-p, lib-c and dep-q.
    expect(out).toBe(0);
  });

  it("runs a library module only when it is required", () => {
    const out = run(`
      const lib = req("lib-a");
      const before = globalThis.__laterRuns ?? 0;
      lib.later();
      return { before, after: globalThis.__laterRuns };
    `);
    expect(out).toEqual({ before: 0, after: 1 });
  });

  it("serves an absolute path to one of its modules, as the ESM loader's facades require", () => {
    const out = run(`
      const lib = req("lib-a");
      return { same: req(req.resolve("lib-a")) === lib, nodeLoaded: added() };
    `);
    expect(out.same).toBe(true);
    expect(out.nodeLoaded).not.toContain("node_modules/lib-a/index.js");
  });

  it("re-runs the library with React Native after a reset, never holding a previous instance", () => {
    const out = run(`
      const first = req("lib-a");
      globalThis.__vitest_native_registry_reset();
      const second = req("lib-a");
      return {
        rerun: first !== second,
        runs: globalThis.__libRuns,
        current: second.singleton === req("react-native").Singleton,
        stale: first.singleton === second.singleton,
      };
    `);
    expect(out).toEqual({ rerun: true, runs: 2, current: true, stale: false });
  });

  it("applies a jest.mock of a React Native module to the library's requires of it", () => {
    const out = run(`
      const target = req.resolve("react-native/Libraries/Singleton");
      const mock = (file) => (file === target ? { id: "mocked" } : mock.NONE);
      mock.NONE = Symbol("none");
      globalThis.__vitest_native_node_mock_for = mock;
      return req("lib-a").singleton;
    `);
    expect(out).toEqual({ id: "mocked" });
  });

  it("is invalidated by a change to a library file, while React Native's registry is kept", () => {
    const out = run(
      `
      const fs = await import("node:fs");
      const file = req.resolve("lib-a/helper.js");
      const source = fs.readFileSync(file, "utf8");
      try {
        fs.writeFileSync(file, source + "// changed\\n");
        return {
          rn: buildRegistry({ ...options, cacheOnly: true }) === rnFile,
          library: buildLibraryRegistry({ ...options, libraryEntries: entries, cacheOnly: true }),
        };
      } finally {
        fs.writeFileSync(file, source);
      }
    `,
      { install: false },
    );
    expect(out).toEqual({ rn: true, library: null });
  });

  it("holds a library's own dependencies and JSON, served by name as one instance", () => {
    const out = run(`
      const lib = req("lib-a");
      return {
        own: lib.own,
        data: lib.data,
        sameOwn: req("dep-p") === lib.own,
        sameOther: req("lib-c") === lib.other,
        nodeLoaded: added(),
      };
    `);
    expect(out).toEqual({
      own: { own: "dep-p" },
      data: { data: true },
      sameOwn: true,
      sameOther: true,
      // Only the peer, which the app's copy must be, goes through Node.
      nodeLoaded: ["node_modules/dep-b/index.js"],
    });
  });

  it("applies a preset shadowing another package to a library's require of it", () => {
    const out = run(`
      const shadow = { other: "preset" };
      globalThis.__vitest_native_preset_mocks = { "lib-c": null };
      globalThis.__vitest_native_preset_require = (request, file) =>
        request === "lib-c" ? shadow : Module._load(file, null, false);
      return req("lib-a").other;
    `);
    expect(out).toEqual({ other: "preset" });
  });

  it("applies a jest.mock of another package before a preset shadowing it", () => {
    const out = run(`
      globalThis.__vitest_native_preset_mocks = { "lib-c": null };
      globalThis.__vitest_native_preset_require = (request, file) =>
        request === "lib-c" ? { other: "preset" } : Module._load(file, null, false);
      const target = req.resolve("lib-c");
      const mock = (file) => (file === target ? { other: "jest.mock" } : mock.NONE);
      mock.NONE = Symbol("none");
      globalThis.__vitest_native_node_mock_for = mock;
      return req("lib-a").other;
    `);
    expect(out).toEqual({ other: "jest.mock" });
  });

  it("resolves a library's files with its own Jest resolver", () => {
    expect(run(`return req("react-native-worklets");`)).toBe("js");
  });

  it("is invalidated by a change to a library's Jest resolver", () => {
    const out = run(
      `
      const fs = await import("node:fs");
      const file = req.resolve("react-native-worklets/jest/resolver.js");
      const source = fs.readFileSync(file, "utf8");
      try {
        fs.writeFileSync(file, source + "// changed\\n");
        return buildLibraryRegistry({ ...options, libraryEntries: entries, cacheOnly: true });
      } finally {
        fs.writeFileSync(file, source);
      }
    `,
      { install: false },
    );
    expect(out).toBeNull();
  });

  it("serves its modules to a file of their package that Node loaded, as one instance", () => {
    const out = run(`
      const lib = req("lib-a");
      // dep-q's entry is not in the registry, so Node loads it; its relative require
      // of a file the registry holds gets the registry's instance.
      return { same: req("dep-q").part === lib.part, nodeLoaded: added() };
    `);
    expect(out).toEqual({
      same: true,
      nodeLoaded: ["node_modules/dep-b/index.js", "node_modules/dep-q/index.js"],
    });
  });

  it("records a failed build, and does not attempt it again until a file it read changes", () => {
    const out = run(
      `
      const fs = await import("node:fs");
      const broken = { ...options, libraryEntries: ["lib-broken"], failOnError: false };
      const first = buildLibraryRegistry(broken);
      let recorded;
      try {
        buildLibraryRegistry({ ...broken, cacheOnly: true, failOnError: true });
      } catch (error) {
        recorded = error.code === "LIBRARY_REGISTRY_FAILED";
      }
      const file = req.resolve("lib-broken/bad.js");
      const source = fs.readFileSync(file, "utf8");
      try {
        fs.writeFileSync(file, "module.exports = {};\\n");
        return {
          first,
          recorded,
          afterFix: buildLibraryRegistry({ ...broken, cacheOnly: true, failOnError: true }),
          rebuilt: typeof buildLibraryRegistry(broken) === "string",
        };
      } finally {
        fs.writeFileSync(file, source);
      }
    `,
      { install: false },
    );
    expect(out).toEqual({ first: null, recorded: true, afterFix: null, rebuilt: true });
  });
});
