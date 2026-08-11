/**
 * Compile what Node cannot run, and nothing else.
 *
 * The engine used to decide by NAME: a package was compiled because detection or a
 * dependency-closure walk selected it. That guess was wrong far more often than right,
 * and every way of being wrong looked identical — a parse error deep inside a package
 * the project never mentioned. `@babel/runtime`, Metro's `lru-cache` chain and a
 * pure-ESM validator all arrived that way, and each was answered by adding another
 * name to exclude.
 *
 * The file answers precisely: if V8 can parse it, Node can run it, so compiling is
 * optional; if V8 cannot, Node cannot, so compiling is required. It is the same
 * question Node is about to ask, which is why it is not a heuristic.
 *
 * What skipping costs is downleveling for Hermes — `const` to `var`, destructuring
 * lowered. Measured against React Native's own sources and the installed ecosystem,
 * that is the whole of what the preset does to a file V8 accepts, and it is
 * behaviour-preserving on Node.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { needsTransform } from "../src/native/transform.mjs";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A file inside a package with the given `type`, so the goal is unambiguous. */
function fileIn(type: "commonjs" | "module" | undefined, name: string, source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-parse-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", ...(type ? { type } : {}) }),
  );
  const file = path.join(root, name);
  fs.writeFileSync(file, source);
  return file;
}

describe("what has to be compiled", () => {
  const cjs = (name: string, src: string) => {
    const file = fileIn("commonjs", name, src);
    return needsTransform(file, src);
  };

  it("compiles the syntax Node cannot run", () => {
    // Every shape the React Native ecosystem actually ships untranspiled.
    expect(cjs("flow.js", "function f(x: number): string { return String(x); }")).toBe(true);
    expect(cjs("flowtype.js", 'import type {A} from "./a"; module.exports = {};')).toBe(true);
    expect(cjs("enum.js", "export enum Status { Active, Done }")).toBe(true);
    expect(cjs("jsx.js", "const A = () => <View><Text>hi</Text></View>;")).toBe(true);
    expect(cjs("ts.js", 'const x: string = "a";')).toBe(true);
    // React Native's own `component` syntax, which only the preset lowers.
    expect(cjs("component.js", "component Greeting(name: string) { return null; }")).toBe(true);
  });

  it("leaves alone what Node can already run", () => {
    // The packages that kept arriving at the Babel preset and crashing it: Babel's own
    // emitted helpers, and a minified one-liner of the shape Metro's cache chain ships.
    expect(
      cjs(
        "helper.js",
        "exports.d = function (o) { return o && o.__esModule ? o : { default: o }; };",
      ),
    ).toBe(false);
    expect(
      cjs("min.js", "var a=1,b=void 0;module.exports=function(){return void 0===b?a:b};"),
    ).toBe(false);
    // Modern syntax V8 accepts needs no downleveling on Node, whatever Hermes wants.
    expect(
      cjs("modern.js", "const {a} = require('x'); class C { #p = 1; m() { return a?.b ?? 1; } }"),
    ).toBe(false);
  });

  it("treats ESM as out of scope rather than guessing", () => {
    // A `type: module` package is still compiled exactly as before. The loader hands
    // those to Node as CommonJS today, and changing that is an interop question about
    // named exports and live bindings that a parse cannot answer.
    const esm = fileIn("module", "index.js", "export const a = 1;");
    expect(needsTransform(esm, "export const a = 1;")).toBe(true);
    const mjs = fileIn("commonjs", "index.mjs", "export const a = 1;");
    expect(needsTransform(mjs, "export const a = 1;")).toBe(true);
    // The discriminating case: a module-goal file that WOULD parse as a script. The
    // goal has to be consulted, not just the parse, or ESM packages quietly change
    // format — which is the Stage 2 question, not this one.
    const plain = "const a = 1;";
    expect(needsTransform(fileIn("module", "plain.js", plain), plain)).toBe(true);
  });

  it("reads the goal from the package, not the file", () => {
    // ESM syntax inside a CommonJS package is something Node cannot run either, so it
    // is compiled — which is what makes the externalized-ESM path keep working.
    expect(cjs("esm-in-cjs.js", "export const a = 1;")).toBe(true);
    // ...and an explicit .cjs extension is a script whatever the package says.
    const cjsFile = fileIn("module", "thing.cjs", "const a = 1; module.exports = a;");
    expect(needsTransform(cjsFile, "const a = 1; module.exports = a;")).toBe(false);
  });
});
