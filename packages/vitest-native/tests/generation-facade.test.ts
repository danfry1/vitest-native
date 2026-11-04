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
import { pathToFileURL } from "node:url";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs
import { releasableFacade } from "../src/native/loader.mjs";

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

it("gives an importer the namespace Node gives the same CommonJS module", () => {
  for (const [name, source] of Object.entries(modules)) {
    fs.writeFileSync(path.join(dir, name), source);
  }
  // Node's own namespace for each module, imported as CommonJS.
  const describe = `
const show = (ns) => Object.fromEntries(Object.keys(ns).map((k) => {
  let v; try { v = ns[k]; } catch (e) { v = "threw"; }
  const shape = v === undefined ? "undefined" : typeof v === "function" ? "fn:" + v.name
    : v !== null && typeof v === "object" ? "obj:" + Object.keys(v).sort().join(",") : v;
  return [k, shape];
}));`;
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

  // The facade for each, written with the names Node's namespace had, in a fresh process.
  for (const name of Object.keys(modules)) {
    const file = path.join(dir, name);
    const url = `${pathToFileURL(file).href}?vnhot=2`;
    fs.writeFileSync(
      path.join(dir, `${name}.facade.mjs`),
      releasableFacade(url, file, 2, Object.keys(node[name])),
    );
  }
  fs.writeFileSync(
    path.join(dir, "facade.mjs"),
    [
      describe,
      "const out = {};",
      ...Object.keys(modules).map(
        (name) => `out[${JSON.stringify(name)}] = show(await import("./${name}.facade.mjs"));`,
      ),
      "console.log(JSON.stringify(out));",
    ].join("\n"),
  );
  const facade = JSON.parse(
    execFileSync(process.execPath, [path.join(dir, "facade.mjs")], { encoding: "utf8" }),
  );
  expect(facade).toEqual(node);
  expect(Object.keys(node["getters.cjs"])).toContain("missing");
});

it("is the module CommonJS loads, once, and lets go of it when released", () => {
  const file = path.join(dir, "counted.cjs");
  fs.writeFileSync(
    file,
    `globalThis.loads = (globalThis.loads ?? 0) + 1; exports.value = { payload: "x".repeat(10) };`,
  );
  const url = `${pathToFileURL(file).href}?vnhot=3`;
  fs.writeFileSync(
    path.join(dir, "counted.facade.mjs"),
    releasableFacade(url, file, 3, ["default", "module.exports", "value"]),
  );
  fs.writeFileSync(
    path.join(dir, "release.mjs"),
    [
      `import { createRequire } from "node:module";`,
      `const released = [];`,
      `globalThis.__vitest_native_hot_facade = (generation, url, release) => released.push([generation, url, release]);`,
      `const ns = await import("./counted.facade.mjs");`,
      `const required = createRequire(import.meta.url)("./counted.cjs");`,
      `const before = { same: ns.default === required, value: ns.value === required.value, loads: globalThis.loads };`,
      `for (const [, , release] of released) release();`,
      `console.log(JSON.stringify({ before, tracked: released.map(([g, u]) => [g, u]),`,
      `  after: [ns.default, ns.value, ns["module.exports"]].map((v) => v === undefined) }));`,
    ].join("\n"),
  );
  const out = JSON.parse(
    execFileSync(process.execPath, [path.join(dir, "release.mjs")], { encoding: "utf8" }),
  );
  expect(out.before).toEqual({ same: true, value: true, loads: 1 });
  expect(out.tracked).toEqual([[3, url]]);
  expect(out.after).toEqual([true, true, true]);
});
