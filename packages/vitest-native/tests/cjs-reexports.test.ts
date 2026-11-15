import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { cjsExportNames, cjsReexports, transformRN } from "../src/native/transform.mjs";
import { COLD_TRANSFORM_BUDGET_MS, warmTransform } from "./support/warm-transform.js";

// Both readers parse with the Babel of a context a transform has built.
beforeAll(
  () => warmTransform(transformRN, path.join(import.meta.dirname, "..")),
  COLD_TRANSFORM_BUDGET_MS,
);

// esbuild's CommonJS output for `export * from "./avatar"` (an index) and for a module
// with its own exports, as @rn-primitives and other tsup-built packages publish it.
const ESBUILD_INDEX = `'use client'
"use strict";
var __defProp = Object.defineProperty;
var __copyProps = (to, from, except, desc) => to;
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
module.exports = __toCommonJS(index_exports);
__reExport(index_exports, require("./avatar"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ...require("./avatar")
});
`;
const ESBUILD_MODULE = `"use strict";
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var avatar_exports = {};
__export(avatar_exports, { Fallback: () => Fallback, Image: () => Image, Root: () => Root });
module.exports = __toCommonJS(avatar_exports);
var Root = () => null, Image = () => null, Fallback = () => null;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Fallback,
  Image,
  Root
});
`;

describe("cjsReexports", () => {
  it("reads esbuild's re-export and its hint", () => {
    expect(cjsReexports(ESBUILD_INDEX)).toEqual(["./avatar"]);
  });

  it("reads module.exports = require(…) and a spread of a require in an exports object", () => {
    expect(cjsReexports('module.exports = require("./a");')).toEqual(["./a"]);
    expect(cjsReexports('module.exports = { ...require("./a"), b: 1 };')).toEqual(["./a"]);
  });

  it("reads TypeScript's __exportStar and __export", () => {
    expect(
      cjsReexports('__exportStar(require("./a"), exports);\n__export(require("./b"));').sort(),
    ).toEqual(["./a", "./b"]);
  });

  it("reads Babel's Object.keys(_x).forEach re-export", () => {
    const babel = `var _a = require("./a");
Object.keys(_a).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  Object.defineProperty(exports, key, { enumerable: true, get: function () { return _a[key]; } });
});
var _unrelated = require("./b");`;
    expect(cjsReexports(babel)).toEqual(["./a"]);
  });

  it("does not take an ordinary require for a re-export", () => {
    expect(cjsReexports('var React = require("react");\nexports.a = React.createElement;')).toEqual(
      [],
    );
  });

  it("returns nothing for code that does not parse", () => {
    expect(cjsReexports('module.exports = require("./a") <')).toEqual([]);
  });
});

describe("cjsExportNames: esbuild's export hint", () => {
  it("reads the names esbuild lists for Node", () => {
    expect(cjsExportNames(ESBUILD_MODULE).sort()).toEqual(["Fallback", "Image", "Root"]);
  });

  it("does not read a re-export's spread as a name", () => {
    expect(cjsExportNames(ESBUILD_INDEX)).toEqual([]);
  });
});
