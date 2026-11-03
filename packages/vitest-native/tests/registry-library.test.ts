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
  JSON.stringify({ name: "lib-a", version: "1.0.0", main: "index.js" }),
);
write(
  path.join(nm, "lib-a", "index.js"),
  [
    `globalThis.__libRuns = (globalThis.__libRuns ?? 0) + 1;`,
    `const singleton = require("react-native/Libraries/Singleton");`,
    `const { helper } = require("./helper");`,
    `module.exports = { singleton, helper, dep: require("dep-b"), later: () => require("./later") };`,
  ].join("\n"),
);
write(path.join(nm, "lib-a", "helper.js"), `exports.helper = "helper";\n`);
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
    const libFile = buildLibraryRegistry({ ...options, libraryEntries: ["lib-a"] });
    if (${install}) installRegistry(rnFile, root, undefined, libFile);
    const req = createRequire(root + "/app.js");
    const before = new Set(Object.keys(req.cache));
    const added = () => Object.keys(req.cache).filter((k) => !before.has(k)).map((k) => k.slice(root.length + 1));
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
        loads.push(request.startsWith(root) ? request.slice(root.length + 1) : request);
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
      loads: ["lib-a", "node_modules/dep-b/index.js"],
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
          library: buildLibraryRegistry({ ...options, libraryEntries: ["lib-a"], cacheOnly: true }),
        };
      } finally {
        fs.writeFileSync(file, source);
      }
    `,
      { install: false },
    );
    expect(out).toEqual({ rn: true, library: null });
  });
});
