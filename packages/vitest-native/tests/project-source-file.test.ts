import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isProjectSourceOnDisk, readProjectSource } from "../src/project-source-file.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-project-source-"));
const file = path.join(dir, "a.ts");
fs.writeFileSync(file, "export const a = 1;\n");

describe("project source ids the early load hooks read (#666)", () => {
  it("reads a file", async () => {
    expect(await readProjectSource(file)).toBe("export const a = 1;\n");
    expect(isProjectSourceOnDisk(file)).toBe(true);
  });

  it.each([
    ["no file (a virtual module)", path.join(dir, "vitest-native.root-mocks.mjs")],
    ["a path through a file", path.join(file, "virtual.ts")],
    ["a directory", dir],
  ])("answers 'no file' for %s, the same way in both", async (_, id) => {
    expect(await readProjectSource(id)).toBeNull();
    expect(isProjectSourceOnDisk(id)).toBe(false);
  });

  // Permissions do not apply to root, and Windows has no mode bits to drop.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "throws any other read error",
    async () => {
      const locked = path.join(dir, "locked.ts");
      fs.writeFileSync(locked, "x");
      fs.chmodSync(locked, 0o000);
      try {
        await expect(readProjectSource(locked)).rejects.toMatchObject({ code: "EACCES" });
      } finally {
        fs.chmodSync(locked, 0o644);
      }
    },
  );
});

describe("projectBabel's cache key agrees with its load hook (#666)", () => {
  it("keys a real file under the Babel config, and answers '' for an id with no file", async () => {
    const { createProjectBabel } = await import("../src/project-babel.js");
    const root = path.resolve(import.meta.dirname, "../tests-native/project-babel-virtual");
    const babel = createProjectBabel(root, "auto", { active: [], hasExpo: false, platform: "ios" });
    expect(babel).not.toBeNull();
    const id = (rel: string) => path.join(root, rel).split(path.sep).join("/");
    expect(babel!.cacheKey(id("src/Model.js"), "")).not.toBe("");
    expect(babel!.cacheKey(id("src/virtual-decorated.ts"), "")).toBe("");
    expect(babel!.cacheKey(id("vitest-native.root-mocks.mjs"), "")).toBe("");
  });
});
