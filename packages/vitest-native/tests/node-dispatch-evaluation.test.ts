// The dispatcher's evaluation hook (src/node-dispatch.mjs, onNodeEvaluation): what Node's
// CommonJS loader evaluates, reported without a patch of its own, for the ownership
// ledger. Each case runs in a fresh Node process, so this worker's loader is untouched.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-dispatch-eval-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const write = (name: string, source: string) => fs.writeFileSync(path.join(dir, name), source);
write("a.cjs", `module.exports = { b: require("./b.cjs"), data: require("./data.json") };\n`);
write("b.cjs", `module.exports = "b";\n`);
write("data.json", `{ "data": true }\n`);
write("esm.mjs", `export const esm = true;\n`);
write("throws.cjs", `throw new Error("evaluation fails");\n`);
write("shadowed.cjs", `module.exports = "real";\n`);
// CommonJS an `import` reaches: Node's ESM loader caches it, and the file it re-exports,
// unloaded, and evaluates them through Module._load.
write("mixed.cjs", `require("./plain.cjs");\nmodule.exports = require("./impl.cjs");\n`);
write("plain.cjs", `module.exports = "plain";\n`);
write("impl.cjs", `exports.impl = true;\n`);
// A module only a resolve hook's short-circuit reaches (no Module._resolveFilename).
write("virtual.cjs", `module.exports = require("./b.cjs");\n`);
// Resolves a file from its requirer while it evaluates.
write(
  "peeks.cjs",
  // Module through module.constructor: a require of node:module would be a load of its own.
  `module.constructor._resolveFilename("./shadowed.cjs", module.parent);\nmodule.exports = "peeks";\n`,
);
// Resolves another file while it evaluates, as a package reading its own assets does.
write("resolves.cjs", `require.resolve("./shadowed.cjs");\nmodule.exports = "resolves";\n`);
const dispatch = pathToFileURL(path.resolve(import.meta.dirname, "../src/node-dispatch.mjs")).href;

function run(body: string): any {
  const script = `
    import Module, { createRequire } from "node:module";
    import { nodeDispatch } from ${JSON.stringify(dispatch)};
    const dir = ${JSON.stringify(dir)};
    const req = createRequire(dir + "/entry.cjs");
    const events = [];
    const rel = (f) => (f === null ? null : f.startsWith(dir) ? f.slice(dir.length + 1) : f);
    const record = (e) => events.push({ file: rel(e.filename), parent: rel(e.parent), via: e.via, cached: Module._cache[e.filename] === e.module });
    const out = await (async () => { ${body} })();
    process.stdout.write(JSON.stringify(out));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8" }),
  );
}

describe("nodeDispatch().onNodeEvaluation", () => {
  it("reports each module Node evaluates, with its parent and how it loaded", () => {
    const events = run(`
      nodeDispatch().onNodeEvaluation(record);
      req("./a.cjs");
      req("./esm.mjs");
      req("./resolves.cjs");
      req("./peeks.cjs");
      return events;
    `);
    expect(events).toEqual([
      { file: "b.cjs", parent: "a.cjs", via: "cjs", cached: true },
      { file: "data.json", parent: "a.cjs", via: "json", cached: true },
      { file: "a.cjs", parent: "entry.cjs", via: "cjs", cached: true },
      { file: "esm.mjs", parent: "entry.cjs", via: "require-esm", cached: true },
      { file: "resolves.cjs", parent: "entry.cjs", via: "cjs", cached: true },
      { file: "peeks.cjs", parent: "entry.cjs", via: "cjs", cached: true },
    ]);
  });

  it("reports CommonJS an import reached, which Node's ESM loader cached unloaded", () => {
    const events = run(`
      nodeDispatch().onNodeEvaluation(record);
      await import(${JSON.stringify(pathToFileURL(path.join(dir, "mixed.cjs")).href)});
      return events.map((e) => e.file).sort();
    `);
    expect(events).toEqual(["impl.cjs", "mixed.cjs", "plain.cjs"]);
  });

  it("keeps a load's capture to that load when a resolve hook answers it", () => {
    const events = run(`
      const { registerHooks } = await import("node:module");
      const { pathToFileURL } = await import("node:url");
      registerHooks({
        resolve: (s, c, n) =>
          s === "virtual-a"
            ? { url: pathToFileURL(dir + "/virtual.cjs").href, format: "commonjs", shortCircuit: true }
            : n(s, c),
      });
      // A step that resolves the request itself, as jest-compat's does.
      nodeDispatch().load.add("mocks", (next) => function (request, parent, ...rest) {
        try { Module._resolveFilename(request, parent); } catch {}
        return next(request, parent, ...rest);
      });
      nodeDispatch().onNodeEvaluation(record);
      req("virtual-a");
      return events;
    `);
    // b.cjs once, from virtual.cjs. Node resolved virtual-a without the dispatcher, so it
    // is not reported; its capture must not be taken by a resolution of another load.
    expect(events).toEqual([{ file: "b.cjs", parent: "virtual.cjs", via: "cjs", cached: true }]);
  });

  it("reports nothing for a cached module, a builtin, or a module that fails", () => {
    const events = run(`
      req("./b.cjs");
      nodeDispatch().onNodeEvaluation(record);
      req("./b.cjs");
      // A requirer elsewhere resolves it afresh (Node caches resolutions per
      // directory), and finds it cached.
      createRequire(dir + "/sub/other.cjs")("../b.cjs");
      req("node:fs");
      req("fs");
      try { req("./throws.cjs"); } catch {}
      return events;
    `);
    expect(events).toEqual([]);
  });

  it("reports nothing a step answers instead of Node", () => {
    const result = run(`
      nodeDispatch().load.add("preset", (next) => function (request, parent, ...rest) {
        return request === "./shadowed.cjs" ? "shadow" : next(request, parent, ...rest);
      });
      nodeDispatch().onNodeEvaluation(record);
      const value = req("./shadowed.cjs");
      req("./b.cjs");
      return { value, events };
    `);
    expect(result).toEqual({
      value: "shadow",
      events: [{ file: "b.cjs", parent: "entry.cjs", via: "cjs", cached: true }],
    });
  });

  it("lets every listener hear a module, then throws the first listener's error", () => {
    const out = run(`
      const heard = [];
      nodeDispatch().onNodeEvaluation(() => { throw new Error("first listener"); });
      nodeDispatch().onNodeEvaluation((e) => heard.push(rel(e.filename)));
      let error = null;
      try { req("./b.cjs"); } catch (e) { error = e.message; }
      return { error, heard, cached: Module._cache[dir + "/b.cjs"] !== undefined };
    `);
    expect(out).toEqual({ error: "first listener", heard: ["b.cjs"], cached: true });
  });

  it("stops when the last listener stops, and costs nothing then", () => {
    const out = run(`
      const plain = () => nodeDispatch().load.run;
      const stop = nodeDispatch().onNodeEvaluation(record);
      const entry = Module._load;
      const observed = plain();
      stop();
      req("./b.cjs");
      return {
        events,
        restored: plain() !== observed && nodeDispatch().load.wrapTail === null,
        sameEntry: Module._load === entry,
      };
    `);
    expect(out).toEqual({ events: [], restored: true, sameEntry: true });
  });
});
