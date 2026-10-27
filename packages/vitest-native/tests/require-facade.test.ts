/**
 * The facade the native ESM loader serves for a module it compiles: Node's CommonJS
 * loader evaluates the module (one instance with its requires), and an ESM importer
 * sees the names Node's cjs-module-lexer finds in the compiled code, as when that code
 * was served itself. Checked with a real Node ESM import in a child process, since the
 * names come from Node's own lexer.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs
import { requireFacade } from "../src/native/loader.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-require-facade-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Babel's CommonJS output for `export const aValue = 1; export { default as Named }
// from './named'; export default {}`, plus a shape the lexer cannot follow.
const compiled = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
Object.defineProperty(exports, "Named", { enumerable: true, get: function () { return _named.default; } });
exports.default = exports.aValue = void 0;
var _named = _interopRequireDefault(require("./named.cjs"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const aValue = exports.aValue = 1;
var _default = exports.default = { kind: "default" };
globalThis.__vnFacadeLoads = (globalThis.__vnFacadeLoads ?? 0) + 1;
`;

it("gives an ESM importer the lexer's names and one CommonJS instance", () => {
  const file = path.join(dir, "compiled.cjs");
  fs.writeFileSync(file, compiled);
  fs.writeFileSync(path.join(dir, "named.cjs"), "module.exports = 'named';");
  const facade = requireFacade(pathToFileURL(file).href, file, compiled);
  expect(facade.format).toBe("commonjs");
  fs.writeFileSync(path.join(dir, "facade.cjs"), facade.source);
  fs.writeFileSync(
    path.join(dir, "importer.mjs"),
    [
      `import { createRequire } from "node:module";`,
      `import * as ns from "./facade.cjs";`,
      `import { Named, aValue } from "./facade.cjs";`,
      `const required = createRequire(import.meta.url)("./compiled.cjs");`,
      `console.log(JSON.stringify({ keys: Object.keys(ns).sort(), Named, aValue,`,
      `  same: ns.default === required, loads: globalThis.__vnFacadeLoads }));`,
    ].join("\n"),
  );
  const out = JSON.parse(
    execFileSync(process.execPath, [path.join(dir, "importer.mjs")], { encoding: "utf8" }),
  );
  expect(out.keys).toEqual(expect.arrayContaining(["Named", "__esModule", "aValue", "default"]));
  expect(out.Named).toBe("named");
  expect(out.aValue).toBe(1);
  // The import is the CommonJS module itself, evaluated once.
  expect(out.same).toBe(true);
  expect(out.loads).toBe(1);
});
