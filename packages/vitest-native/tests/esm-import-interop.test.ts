/**
 * Default imports in ES-module-goal files the native engine compiles to CommonJS.
 *
 * Node gives an ES module importing CommonJS the whole `module.exports` as its
 * default. Babel's interop, which the React Native preset applies, reads
 * `exports.default` whenever the target sets `__esModule` — so tslib's Node ESM
 * wrapper (`import tslib from '../tslib.js'` over CommonJS that sets `__esModule` and
 * has no default) got `undefined`. The compiled output is EXECUTED here, through a
 * minimal CommonJS loader, because what matters is the value the import receives.
 * See esmImportInterop in src/native/transform.mjs for the rule and its evidence.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// @ts-expect-error — runtime .mjs, no types
import { transformRN, needsTransform } from "../src/native/transform.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Compiled output requires @babel/runtime helpers, which resolve beside the preset.
const presetRequire = createRequire(
  createRequire(path.join(projectRoot, "package.json")).resolve("@react-native/babel-preset"),
);

let dir: string;

/** Write `files` (relative path -> contents) under the fixture directory. */
function write(files: Record<string, string>) {
  for (const [rel, contents] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

/**
 * Run `entry` as the engine's CommonJS hook would: compile what needsTransform selects
 * (every ESM-goal file) with transformRN, run everything else as published.
 */
function run(entry: string): Record<string, unknown> {
  const cache = new Map<string, { exports: unknown }>();
  const load = (file: string): unknown => {
    const hit = cache.get(file);
    if (hit) return hit.exports;
    const mod = { exports: {} as unknown };
    cache.set(file, mod);
    const src = fs.readFileSync(file, "utf8");
    const code = needsTransform(file, src) ? transformRN(file, src, projectRoot) : src;
    const req = (spec: string) =>
      spec.startsWith(".") ? load(path.resolve(path.dirname(file), spec)) : presetRequire(spec);
    new Function("exports", "require", "module", code)(mod.exports, req, mod);
    return mod.exports;
  };
  return load(path.join(dir, entry)) as Record<string, unknown>;
}

beforeAll(() => {
  // Outside the project root, so the preset compiles it as it compiles a package.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-esm-interop-"));
  write({
    // tslib's shape: CommonJS that sets __esModule and has no default.
    "cjs/package.json": "{}",
    "cjs/tslib.js":
      'Object.defineProperty(exports, "__esModule", { value: true });\n' +
      'exports.__extends = function __extends() { return "extends-ok"; };\n',
    // Babel-compiled CommonJS with a real default, as React Native libraries publish.
    "cjs/babel-default.js":
      'Object.defineProperty(exports, "__esModule", { value: true });\n' +
      'exports.default = "the-default";\nexports.named = "named";\n',
    // Hand-written CommonJS.
    "cjs/plain.js": 'module.exports = { plain: "plain" };\n',
    // An ES module target, itself compiled.
    "esm/package.json": '{ "type": "module" }',
    "esm/target.js": 'export default "esm-default";\nexport const named = "esm-named";\n',
    // tslib's modules/index.js, verbatim in shape.
    "esm/tslib-wrapper.js":
      "import tslib from '../cjs/tslib.js';\nconst { __extends } = tslib;\nexport { __extends };\n",
    "esm/importer.js": [
      "import tslib from '../cjs/tslib.js';",
      "import plain from '../cjs/plain.js';",
      "export const extendsResult = tslib.__extends();",
      "export { plain };",
      "export { default as reexported } from '../cjs/tslib.js';",
      "",
    ].join("\n"),
    // Targets whose default Babel's interop already found.
    "esm/defaults.js": [
      "import babelDefault from '../cjs/babel-default.js';",
      "import esmDefault from './target.js';",
      "export { babelDefault, esmDefault };",
      "",
    ].join("\n"),
    "esm/importer.mjs": "import tslib from '../cjs/tslib.js';\nexport const t = tslib;\n",
    // Script-goal source with import syntax: Metro's Babel interop, unchanged.
    "script/package.json": "{}",
    "script/importer.js": "import tslib from '../cjs/tslib.js';\nexport const t = tslib;\n",
  });
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ESM-goal default imports", () => {
  it("gives tslib's Node ESM wrapper module.exports from __esModule CommonJS with no default", () => {
    const tslib = run("esm/tslib-wrapper.js");
    expect(typeof tslib.__extends).toBe("function");
    expect((tslib.__extends as () => string)()).toBe("extends-ok");
  });

  it("gives module.exports to a default import and to `export { default } from`", () => {
    const out = run("esm/importer.js");
    expect(out.extendsResult).toBe("extends-ok");
    expect(out.reexported).toHaveProperty("__extends");
    expect(out.plain).toEqual({ plain: "plain" });
  });

  it("keeps an ES module target's own default export", () => {
    expect(run("esm/defaults.js").esmDefault).toBe("esm-default");
  });

  it("keeps the default of Babel-compiled CommonJS that has one, as Metro gives it", () => {
    expect(run("esm/defaults.js").babelDefault).toBe("the-default");
  });

  it("applies to .mjs wherever it sits", () => {
    expect(run("esm/importer.mjs").t).toHaveProperty("__extends");
  });

  it("leaves script-goal source on Babel's interop", () => {
    // Not an ES module to Node, so Node's semantics do not apply: this is what Metro
    // and babel-jest give the same file.
    expect(run("script/importer.js").t).toBeUndefined();
  });
});
