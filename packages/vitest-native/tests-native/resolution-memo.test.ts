import fs from "node:fs";
import Module, { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The require hook keeps the resolutions it made for the life of the worker, and the
// engine keeps each compiled source keyed by its size and mtime (hooks.mjs,
// transform.mjs). Each case below is a way those could hand back an answer that is no
// longer the one Node, or the file on disk, gives. A module is loaded again here by
// deleting it from require.cache, which is what the hot reset does between test files.
//
// The fixtures live in a fresh temporary directory, under its real path, the spelling
// Node resolves to.
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-resolution-memo-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const write = (rel: string, source: string) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
};
const exportsPackage = (dir: string, name: string, value: string) => {
  write(`${dir}/node_modules/${name}/package.json`, JSON.stringify({ name, exports: "./i.js" }));
  return write(`${dir}/node_modules/${name}/i.js`, `module.exports = ${JSON.stringify(value)};`);
};
const requireFrom = (dir: string) => createRequire(write(`${dir}/parent.js`, ""));

describe("a resolution held from an earlier require", () => {
  it("is per requiring directory: one request, two nested copies", () => {
    exportsPackage("d1", "nested-q", "one");
    exportsPackage("d2", "nested-q", "two");
    expect(requireFrom("d1")("nested-q")).toBe("one");
    expect(requireFrom("d2")("nested-q")).toBe("two");
  });

  it("is not used for require.resolve with `paths`", () => {
    const a = exportsPackage("pa", "paths-q", "a");
    const b = exportsPackage("pb", "paths-q", "b");
    const req = requireFrom("pc");
    expect(req.resolve("paths-q", { paths: [path.join(root, "pa")] })).toBe(a);
    expect(req.resolve("paths-q", { paths: [path.join(root, "pb")] })).toBe(b);
  });

  it("is per set of conditions", () => {
    write(
      "cd/node_modules/cond-q/package.json",
      JSON.stringify({ name: "cond-q", exports: { "vn-custom": "./a.js", default: "./b.js" } }),
    );
    const a = write("cd/node_modules/cond-q/a.js", "");
    const b = write("cd/node_modules/cond-q/b.js", "");
    const parent = new Module(path.join(root, "cd/parent.js"));
    parent.filename = parent.id;
    parent.paths = (
      Module as unknown as { _nodeModulePaths(dir: string): string[] }
    )._nodeModulePaths(path.join(root, "cd"));
    const resolveWith = (conditions: string[]) =>
      (
        Module as unknown as {
          _resolveFilename(r: string, p: Module, m: boolean, o: object): string;
        }
      )._resolveFilename("cond-q", parent, false, { conditions: new Set(conditions) });
    expect(resolveWith(["require", "node", "vn-custom"])).toBe(a);
    expect(resolveWith(["require", "node"])).toBe(b);
  });

  it("is resolved again once its file is gone, reaching the outer copy as Node does", () => {
    exportsPackage("ro", "removed-q", "outer");
    const inner = exportsPackage("ro/inner", "removed-q", "inner");
    const req = requireFrom("ro/inner");
    expect(req("removed-q")).toBe("inner");
    delete req.cache[inner];
    fs.rmSync(path.join(root, "ro/inner/node_modules"), { recursive: true });
    expect(req("removed-q")).toBe("outer");
  });

  it("is resolved again once its entry file is gone, failing as Node does", () => {
    const entry = exportsPackage("ge", "gone-entry-q", "here");
    const req = requireFrom("ge");
    expect(req("gone-entry-q")).toBe("here");
    delete req.cache[entry];
    // The package stays; only the file its `exports` names is removed.
    fs.rmSync(entry);
    expect(() => req("gone-entry-q")).toThrow(
      expect.objectContaining({ code: "MODULE_NOT_FOUND" }),
    );
  });

  it("is dropped when the source extensions change", () => {
    const update = (globalThis as { __vitest_native_require_hooks_update?: (next: object) => void })
      .__vitest_native_require_hooks_update;
    expect(update, "the native engine's require hooks are installed").toBeTypeOf("function");
    const js = write("se/thing.js", "");
    const ts = write("se/thing.ts", "");
    const req = requireFrom("se");
    // Metro's order: `.js` before `.ts`.
    expect(req.resolve("./thing")).toBe(js);
    const original = JSON.parse(
      process.env.VITEST_NATIVE_SOURCE_EXTS ?? '["js","jsx","json","ts","tsx"]',
    ) as string[];
    try {
      update!({ sourceExts: ["ts", "tsx", "js", "jsx", "json"] });
      expect(req.resolve("./thing")).toBe(ts);
    } finally {
      update!({ sourceExts: original });
    }
    expect(req.resolve("./thing")).toBe(js);
  });
});

describe("a compiled source edited after it was loaded", () => {
  // Loaded through the CommonJS `.ts` hook, which compiles it.
  const load = (file: string) => {
    const req = createRequire(file);
    delete req.cache[file];
    return (req(file) as { edit: string }).edit;
  };

  it("is compiled again when only its mtime changed (same size)", () => {
    const file = write("edit/mtime.ts", 'export const edit: string = "a";\n');
    expect(load(file)).toBe("a");
    const { mtime } = fs.statSync(file);
    fs.writeFileSync(file, 'export const edit: string = "b";\n');
    const later = new Date(mtime.getTime() + 5000);
    fs.utimesSync(file, later, later);
    expect(load(file)).toBe("b");
  });

  it("is compiled again when only its size changed (same mtime)", () => {
    const file = write("edit/size.ts", 'export const edit: string = "a";\n');
    expect(load(file)).toBe("a");
    const { atime, mtime } = fs.statSync(file);
    fs.writeFileSync(file, 'export const edit: string = "bb";\n');
    fs.utimesSync(file, atime, mtime);
    expect(load(file)).toBe("bb");
  });
});
