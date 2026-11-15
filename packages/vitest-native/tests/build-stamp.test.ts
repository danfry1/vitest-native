/**
 * The native and hot gates run the built plugin (tests-native configs import
 * ../dist/index.mjs). After a merge or an edit to src/, a gate ran the old build without
 * a word: a merge of two fixes failed one fix's own gate until dist/ was rebuilt. The
 * build now stamps what it read, and every config that loads dist/ checks the stamp
 * first (scripts/build-stamp.mjs, tests-native/support/fresh-dist.mts).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { BUILD_FILES } from "../scripts/build-inputs.mjs";
import { STAMP, assertFreshDist, distStaleness, writeBuildStamp } from "../scripts/build-stamp.mjs";

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** A package with a nested source file and every build file, built and stamped. */
function builtPackage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-build-stamp-"));
  roots.push(root);
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write("src/index.ts", "export const a = 1;\n");
  write("src/native/reset.mjs", "export const b = 1;\n");
  for (const file of BUILD_FILES) write(file, `// ${file}\n`);
  writeBuildStamp(root);
  return { root, write };
}

describe("a gate's dist/", () => {
  it("is fresh straight after a build", () => {
    const { root } = builtPackage();
    expect(distStaleness(root)).toBeNull();
    expect(() => assertFreshDist(root)).not.toThrow();
  });

  it("stays fresh when a checkout rewrites a file with the same contents", () => {
    const { root, write } = builtPackage();
    const later = new Date(Date.now() + 60_000);
    write("src/native/reset.mjs", "export const b = 1;\n");
    fs.utimesSync(path.join(root, "src/native/reset.mjs"), later, later);
    expect(distStaleness(root)).toBeNull();
  });

  it.each([
    ["an edit to a nested source file", "src/native/reset.mjs", "export const b = 2;\n"],
    ["a new source file", "src/native/new.mjs", "export {};\n"],
    ...BUILD_FILES.map((file) => [`an edit to ${file}`, file, "// changed\n"]),
  ])("is stale after %s, and the gate fails naming the fix", (_, file, text) => {
    const { root, write } = builtPackage();
    write(file, text);
    expect(() => assertFreshDist(root)).toThrowError(
      /dist\/ is stale: src\/ or the build files changed.*Run `bun run build`/,
    );
  });

  it("is stale after a source file is deleted", () => {
    const { root } = builtPackage();
    fs.rmSync(path.join(root, "src/native/reset.mjs"));
    expect(distStaleness(root)).toMatch(/changed since the last/);
  });

  it("is stale when no build recorded its stamp", () => {
    const { root } = builtPackage();
    fs.rmSync(path.join(root, STAMP));
    expect(() => assertFreshDist(root)).toThrowError(/no record of a build/);
  });
});

describe("the stamp's wiring", () => {
  it("is written by the build script, after everything else the build does", () => {
    const build = JSON.parse(fs.readFileSync(path.join(PACKAGE, "package.json"), "utf8")).scripts
      .build as string;
    expect(build.split(" && ").at(-1)).toBe("node scripts/build-stamp.mjs write");
  });

  it("never ships: it lives outside dist/", () => {
    expect(STAMP.startsWith("dist/")).toBe(false);
  });

  // Every config that loads the built plugin checks the stamp before it does: the guard
  // is its first import, so it runs before dist/ is evaluated.
  it("is checked first by every config that loads dist/", () => {
    const guard = path.join(PACKAGE, "tests-native/support/fresh-dist.mts");
    const configs = ["tests-native", "crosscheck"]
      .flatMap((dir) =>
        fs
          .readdirSync(path.join(PACKAGE, dir), { recursive: true, withFileTypes: true })
          .filter(
            (entry) => entry.isFile() && /(^|[./])vitest(\..+)?\.config\.m?ts$/.test(entry.name),
          )
          .map((entry) => path.join(entry.parentPath, entry.name)),
      )
      .filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));
    const loadsDist = configs.filter((file) =>
      /["'](\.\.\/)+dist\//.test(fs.readFileSync(file, "utf8")),
    );
    expect(loadsDist.length).toBeGreaterThan(40);
    const unguarded = loadsDist.filter((file) => {
      const firstImport = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .find((line) => line.startsWith("import "));
      const specifier = firstImport?.match(/^import ["']([^"']+)["'];$/)?.[1];
      return !specifier || path.resolve(path.dirname(file), specifier) !== guard;
    });
    expect(unguarded.map((file) => path.relative(PACKAGE, file))).toEqual([]);
  });
});
