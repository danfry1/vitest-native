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
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
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
    // Every form Babel compiles through interopRequireWildcard.
    "esm/forms.js": [
      "import tslib, { __extends } from '../cjs/tslib.js';",
      "import * as ns from '../cjs/tslib.js';",
      "export const both = tslib.__extends === __extends ? tslib.__extends() : 'different';",
      "export const nsDefault = ns.default.__extends();",
      "export const nsNamed = ns.__extends();",
      "export { ns };",
      "",
    ].join("\n"),
    "esm/plain-forms.js": [
      "import plain, { plain as named } from '../cjs/plain.js';",
      "import * as ns from '../cjs/plain.js';",
      "export { plain, named, ns };",
      "",
    ].join("\n"),
    "esm/babel-forms.js": [
      "import d, { named } from '../cjs/babel-default.js';",
      "import * as ns from '../cjs/babel-default.js';",
      "export { d, named, ns };",
      "",
    ].join("\n"),
    // A live binding: CommonJS that changes a member after it is imported.
    "cjs/live.js":
      'Object.defineProperty(exports, "__esModule", { value: true });\n' +
      "exports.count = 0;\nexports.bump = () => { exports.count++; };\n",
    "esm/live.js": [
      "import live, { count, bump } from '../cjs/live.js';",
      "export const read = () => [live.count, count];",
      "export { bump };",
      "",
    ].join("\n"),
    // An import cycle through TypeScript's CommonJS output, which sets exports.default
    // after the require that cycles back.
    // Each form in its own file: Babel compiles a default import beside a namespace
    // import through the wildcard helper alone.
    "cjs/cycle-a.js":
      'Object.defineProperty(exports, "__esModule", { value: true });\n' +
      "const m = require('../esm/cycle-m.js');\n" +
      "const n = require('../esm/cycle-n.js');\n" +
      'exports.default = function a() { return "a-default"; };\n' +
      "exports.viaM = () => m.callA();\nexports.viaNs = () => n.callNs();\n",
    "esm/cycle-m.js": "import a from '../cjs/cycle-a.js';\nexport const callA = () => a();\n",
    "esm/cycle-n.js":
      "import * as ns from '../cjs/cycle-a.js';\nexport const callNs = () => ns.default();\n",
    "esm/cycle.js": "export { viaM, viaNs } from '../cjs/cycle-a.js';\n",
    // Exports served by a get trap, as preset subpath modules are.
    "cjs/proxy.js":
      "module.exports = new Proxy({}, { get: (_, k) =>\n" +
      '  k === "__esModule" ? true : k === "default" ? () => "proxy-default" : undefined });\n',
    "esm/proxy.js": [
      "import served from '../cjs/proxy.js';",
      "export const viaDefault = () => served();",
      "export { viaNs } from './proxy-ns.js';",
      "",
    ].join("\n"),
    "esm/proxy-ns.js":
      "import * as ns from '../cjs/proxy.js';\nexport const viaNs = () => ns.default();\n",
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

  it("gives module.exports to a default import beside named ones, and ns.default", () => {
    const out = run("esm/forms.js");
    expect(out.both).toBe("extends-ok");
    expect(out.nsDefault).toBe("extends-ok");
    expect(out.nsNamed).toBe("extends-ok");
    // The namespace keeps the module's own keys, as Babel's helper returns the module.
    expect(Object.keys(out.ns as object)).toEqual(["__extends"]);
  });

  it("keeps Babel's interop for plain CommonJS and for CommonJS with a default", () => {
    const plain = run("esm/plain-forms.js");
    expect(plain.plain).toEqual({ plain: "plain" });
    expect(plain.named).toBe("plain");
    expect((plain.ns as { default: unknown }).default).toEqual({ plain: "plain" });
    const babel = run("esm/babel-forms.js");
    expect(babel.d).toBe("the-default");
    expect(babel.named).toBe("named");
    expect((babel.ns as { default: unknown }).default).toBe("the-default");
  });

  it("keeps named imports live", () => {
    const live = run("esm/live.js") as { read: () => number[]; bump: () => void };
    live.bump();
    expect(live.read()).toEqual([1, 1]);
  });

  it("reads the default when it is used, so an import cycle sees it once it is set", () => {
    const out = run("esm/cycle.js") as { viaM: () => string; viaNs: () => string };
    expect(out.viaM()).toBe("a-default");
    expect(out.viaNs()).toBe("a-default");
  });

  it("reads a Proxy-served module's default through its trap", () => {
    const out = run("esm/proxy.js") as { viaDefault: () => string; viaNs: () => string };
    expect(out.viaDefault()).toBe("proxy-default");
    expect(out.viaNs()).toBe("proxy-default");
  });

  it("matches Node's own ES module loader for CommonJS with no default", () => {
    // Node runs the same files uncompiled: what each import form receives from tslib's
    // shape there is what the compiled file must receive here.
    const probe = path.join(dir, "esm/node-probe.js");
    fs.writeFileSync(
      probe,
      [
        "import tslib, { __extends } from '../cjs/tslib.js';",
        "import * as ns from '../cjs/tslib.js';",
        // Another specifier for the same module: one namespace object, as in Node.
        "import * as again from './../cjs/tslib.js';",
        "export const shape = [",
        "  Object.keys(tslib).join(),",
        "  tslib.__extends === __extends,",
        "  ns.default === tslib,",
        "  ns.__extends === __extends,",
        "  ns === again,",
        "];",
        "",
      ].join("\n"),
    );
    const node = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import(${JSON.stringify(pathToFileURL(probe).href)})` +
          ".then((m) => process.stdout.write(JSON.stringify(m.shape)))",
      ],
      { encoding: "utf8" },
    );
    expect(node.stderr).toBe("");
    expect(run("esm/node-probe.js").shape).toEqual(JSON.parse(node.stdout));
  });

  it("leaves script-goal source on Babel's interop", () => {
    // Not an ES module to Node, so Node's semantics do not apply: this is what Metro
    // and babel-jest give the same file.
    expect(run("script/importer.js").t).toBeUndefined();
  });
});
