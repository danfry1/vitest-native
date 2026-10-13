/**
 * esmExportNames reads a package's named exports from its ESM source, for a preset
 * whose package changes its API between majors (skia). Each form of `export` is a way
 * to miss a name, and a missed name is an import that fails in the user's test.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { esmExportNames } from "../src/presets/esm-export-names.js";

function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-esm-exports-"));
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), source);
  }
  return path.join(root, "index.js");
}

describe("esmExportNames", () => {
  it("reads every form of named export", () => {
    const entry = tree({
      "index.js": [
        "export const a = 1, { b, c: [d, ...e] } = {};",
        "export function f() {}",
        "export class G {}",
        "const h = 1; export { h, h as i };",
        'export { j as k } from "./other.js";',
        'export * as ns from "./other.js";',
        'export { l as "quoted name" } from "./other.js";',
        "export default 1;",
      ].join("\n"),
      "other.js": "export const j = 1, l = 2;",
    });
    expect(esmExportNames(entry)).toEqual(
      ["G", "a", "b", "d", "e", "f", "h", "i", "k", "ns", "quoted name"].sort(),
    );
  });

  it("follows export * through directories and files, leaving out their defaults", () => {
    const entry = tree({
      "index.js": 'export * from "./views"; export * from "./skia/core";',
      "views/index.js": 'export * from "./Canvas"; export default 1;',
      "views/Canvas.js": "export const Canvas = 1;",
      "skia/core.js": 'export const Path = 1; export * from "../views";',
    });
    expect(esmExportNames(entry)).toEqual(["Canvas", "Path"]);
  });

  it("resolves a platform file first, in Metro's order", () => {
    const entry = tree({
      "index.js": 'export * from "./a"; export * from "./b";',
      "a.js": "export const web = 1;",
      "a.native.js": "export const native = 1;",
      "a.ios.js": "export const ios = 1;",
      "b.web.js": "export const web = 1;",
      "b.native.js": "export const native = 1;",
    });
    expect(esmExportNames(entry)).toEqual(["ios", "native"]);
  });

  it("refuses a re-export from another package rather than miss its names", () => {
    const entry = tree({ "index.js": 'export * from "other-package";' });
    expect(() => esmExportNames(entry)).toThrow(/re-exports a package \('other-package'\)/);
  });

  it("names the module it cannot resolve", () => {
    const entry = tree({ "index.js": 'export * from "./missing";' });
    expect(() => esmExportNames(entry)).toThrow(/cannot resolve '\.\/missing'/);
  });
});
