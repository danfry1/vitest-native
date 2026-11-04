/**
 * The hot runtime's generation facade (releasableFacade in loader.mjs): a CommonJS module
 * a test file imports, served from its second generation on as an ES module that requires
 * it. Its namespace must be the one Node gives the same module served as CommonJS, name
 * for name and value for value, given the names Node's namespace had; and releasing it
 * must leave nothing of the module reachable from that namespace. Checked with real Node
 * imports in a child process, against Node's own CommonJS namespace for each module.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-generation-facade-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Shapes Node's CommonJS namespace treats specially: a name the lexer finds that is not
// an own property, a getter that throws, `exports.default` (Node's `default` is always
// module.exports), `__esModule`, a name that is not an identifier, a re-export, and
// module.exports replaced by a function or a primitive.
const modules: Record<string, string> = {
  "plain.cjs": `exports.a = 1; exports.b = { deep: true }; exports["not-an-id"] = "x";`,
  "babel.cjs": `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.named = void 0;
const named = exports.named = () => "named";
var _default = exports.default = { kind: "default" };`,
  "getters.cjs": `Object.defineProperty(exports, "boom", { enumerable: true, get() { throw new Error("boom"); } });
Object.defineProperty(exports, "lazy", { enumerable: true, get() { return "lazy"; } });
if (false) exports.missing = 1;`,
  "fn.cjs": `module.exports = function called() { return "called"; }; module.exports.extra = 2;`,
  "reexport.cjs": `module.exports = require("./plain.cjs");`,
  "primitive.cjs": `module.exports = 42;`,
};

const loader = new URL("../src/native/loader.mjs", import.meta.url).href;

// A child process that serves `?vnhot=N` imports the way the hot runtime's in-thread
// loader does once a module's names are recorded: releasableFacade over bindFacade.
function facadeRunner(body: string) {
  return [
    `import { registerHooks } from "node:module";`,
    `import { bindFacade, facadeModule, releasableFacade, releaseGenerations } from ${JSON.stringify(loader)};`,
    `import { fileURLToPath } from "node:url";`,
    `globalThis.__vitest_native_hot_generation = { bind: bindFacade };`,
    `const names = new Map();`,
    `registerHooks({ load(url, context, next) {`,
    `  const stamp = /\\?vnhot=(\\d+)$/.exec(url);`,
    `  if (!stamp) return next(url, context);`,
    `  const id = facadeModule(url, fileURLToPath(url), names.get(url.slice(0, stamp.index)));`,
    `  return { format: "module", source: releasableFacade(id, Number(stamp[1])), shortCircuit: true };`,
    `} });`,
    body,
  ].join("\n");
}

it("gives an importer the namespace Node gives the same CommonJS module", () => {
  for (const [name, source] of Object.entries(modules)) {
    fs.writeFileSync(path.join(dir, name), source);
  }
  const describe = `
const show = (ns) => Object.fromEntries(Object.keys(ns).map((k) => {
  let v; try { v = ns[k]; } catch (e) { v = "threw"; }
  const shape = v === undefined ? "undefined" : typeof v === "function" ? "fn:" + v.name
    : v !== null && typeof v === "object" ? "obj:" + Object.keys(v).sort().join(",") : v;
  return [k, shape];
}));`;
  // Node's own namespace for each module, imported as CommonJS.
  fs.writeFileSync(
    path.join(dir, "node.mjs"),
    [
      describe,
      "const out = {};",
      ...Object.keys(modules).map(
        (name) => `out[${JSON.stringify(name)}] = show(await import("./${name}"));`,
      ),
      "console.log(JSON.stringify(out));",
    ].join("\n"),
  );
  const node = JSON.parse(
    execFileSync(process.execPath, [path.join(dir, "node.mjs")], { encoding: "utf8" }),
  );
  // The facade for each, given the names Node's namespace had, in a fresh process.
  fs.writeFileSync(
    path.join(dir, "facade.mjs"),
    facadeRunner(
      [
        describe,
        `const recorded = ${JSON.stringify(Object.fromEntries(Object.entries(node).map(([name, ns]) => [name, Object.keys(ns as object)])))};`,
        `const out = {};`,
        `for (const [name, keys] of Object.entries(recorded)) {`,
        `  const url = new URL("./" + name, import.meta.url).href;`,
        `  names.set(url, keys);`,
        `  out[name] = show(await import(url + "?vnhot=2"));`,
        `}`,
        "console.log(JSON.stringify(out));",
      ].join("\n"),
    ),
  );
  const facade = JSON.parse(
    execFileSync(process.execPath, [path.join(dir, "facade.mjs")], { encoding: "utf8" }),
  );
  expect(facade).toEqual(node);
  expect(Object.keys(node["getters.cjs"])).toContain("missing");
});

it("is the module CommonJS loads, once, and lets go of it when released", () => {
  fs.writeFileSync(
    path.join(dir, "counted.cjs"),
    `globalThis.loads = (globalThis.loads ?? 0) + 1; exports.value = { payload: "x".repeat(10) };`,
  );
  fs.writeFileSync(
    path.join(dir, "release.mjs"),
    facadeRunner(
      [
        `import { createRequire } from "node:module";`,
        `const url = new URL("./counted.cjs", import.meta.url).href;`,
        `names.set(url, ["default", "module.exports", "value"]);`,
        `const ns = await import(url + "?vnhot=3");`,
        `const required = createRequire(import.meta.url)("./counted.cjs");`,
        `const before = { same: ns.default === required, value: ns.value === required.value, loads: globalThis.loads };`,
        // Generation 3 is kept while 4 is current, and released once 5 is.
        `const kept = [releaseGenerations(4), ns.default === required];`,
        `const released = releaseGenerations(5);`,
        `console.log(JSON.stringify({ before, kept, released,`,
        `  after: [ns.default, ns.value, ns["module.exports"]].map((v) => v === undefined) }));`,
      ].join("\n"),
    ),
  );
  const out = JSON.parse(
    execFileSync(process.execPath, [path.join(dir, "release.mjs")], { encoding: "utf8" }),
  );
  expect(out.before).toEqual({ same: true, value: true, loads: 1 });
  expect(out.kept).toEqual([0, true]);
  expect(out.released).toBe(1);
  expect(out.after).toEqual([true, true, true]);
});
