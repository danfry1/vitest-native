/**
 * The cost of projectBabel's root check, by count. Ruling a file out of the project can
 * take native realpath calls (root-spelling.mjs), and Vite asks about every module, through
 * both the cache key and load. The answer for an id is worked out once per run.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";

const spelling = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../src/native/root-spelling.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/native/root-spelling.mjs")>();
  return {
    ...actual,
    rootSpellingOf: (root: string, file: string) => {
      spelling.calls++;
      return actual.rootSpellingOf(root, file);
    },
  };
});

const { createProjectBabel } = await import("../src/project-babel.js");

const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "vn-pb-cost-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app", private: true }));
fs.mkdirSync(path.join(root, "node_modules", "@babel"), { recursive: true });
fs.symlinkSync(
  path.dirname(fs.realpathSync(createRequire(import.meta.url).resolve("@babel/core/package.json"))),
  path.join(root, "node_modules", "@babel", "core"),
  process.platform === "win32" ? "junction" : "dir",
);
fs.writeFileSync(path.join(root, "babel.config.js"), "module.exports = {};");

it("checks each id against the root once, however often it is asked about", async () => {
  const projectBabel = createProjectBabel(root, "auto", {
    active: [],
    hasExpo: false,
    platform: "ios",
  })!;
  // Files outside the root, as Vite's ids spell them: the costly case.
  const outside = Array.from({ length: 5 }, (_, i) =>
    path.join(path.dirname(root), `vn-pb-cost-outside-${i}.ts`).split(path.sep).join("/"),
  );
  for (let round = 0; round < 3; round++) {
    for (const id of outside) {
      expect(projectBabel.cacheKey(id, "")).toBe("");
      expect(await projectBabel.load(id, undefined)).toBeUndefined();
    }
  }
  expect(spelling.calls).toBe(outside.length);
});
