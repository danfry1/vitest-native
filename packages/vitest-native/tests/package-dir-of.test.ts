import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error — runtime .mjs, no types
import { packageDirOf } from "../src/native/match.mjs";

/** A project with one package installed under `exports`, at a nested node_modules too. */
function project(exportsMap: unknown, { nested = false } = {}): { root: string; dir: string } {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-pkgdir-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  const base = nested ? path.join(root, "node_modules", "outer") : root;
  const dir = path.join(base, "node_modules", "@scope", "lib");
  fs.mkdirSync(path.join(dir, "build"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "@scope/lib", version: "1.0.0", exports: exportsMap }),
  );
  fs.writeFileSync(path.join(dir, "build", "index.js"), "export const x = 1;\n");
  if (nested) fs.writeFileSync(path.join(base, "package.json"), JSON.stringify({ name: "outer" }));
  return { root, dir };
}

describe("packageDirOf", () => {
  it("finds a package that exports ./package.json", () => {
    const { root, dir } = project({ ".": "./build/index.js", "./package.json": "./package.json" });
    expect(packageDirOf("@scope/lib", root)).toBe(dir);
  });

  it("finds a package whose exports map leaves out ./package.json", () => {
    // expo-symbols 57's shape: `require.resolve("expo-symbols/package.json")` throws.
    const { root, dir } = project({ ".": "./build/index.js" });
    expect(packageDirOf("@scope/lib", root)).toBe(dir);
  });

  it("finds one whose exports offer only an import condition", () => {
    // The entry does not resolve through require either.
    const { root, dir } = project({ ".": { import: "./build/index.js" } });
    expect(packageDirOf("@scope/lib", root)).toBe(dir);
  });

  it("finds the copy Node would load from the asking directory", () => {
    const { root, dir } = project({ ".": "./build/index.js" }, { nested: true });
    expect(packageDirOf("@scope/lib", path.join(root, "node_modules", "outer"))).toBe(dir);
    expect(packageDirOf("@scope/lib", root)).toBeNull();
  });
});
