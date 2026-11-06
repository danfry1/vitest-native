/**
 * The docs may name a `VITEST_NATIVE_*` environment variable only if it does what they
 * say. Settings that moved into the project context (plugin.ts RETIRED_VARIABLES) are
 * no longer read, so a page that still advertises one sends users to a variable that
 * does nothing: a user reached for VITEST_NATIVE_DIAGNOSTICS twice. A retired name may
 * appear only where the paragraph says it is not read; any other name must be one the
 * source reads.
 *
 * The troubleshooting section on React Native's precompiled modules is held to the
 * registry's cache key the same way: each input it lists must be one the key hashes.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "../../..");
const PACKAGE = path.join(REPO, "packages/vitest-native");
const read = (file: string) => fs.readFileSync(file, "utf8");

const PAGES = [
  path.join(PACKAGE, "README.md"),
  ...["website/guide", "packages/vitest-native/docs"].flatMap((dir) =>
    fs
      .readdirSync(path.join(REPO, dir))
      .filter((f) => f.endsWith(".md"))
      .map((f) => path.join(REPO, dir, f)),
  ),
];

const plugin = read(path.join(PACKAGE, "src/plugin.ts"));
const retiredBlock = /const RETIRED_VARIABLES = new Set\(\s*\(([\s\S]*?)\)\s*\.split/.exec(plugin);
const RETIRED = new Set(
  (retiredBlock?.[1] ?? "")
    .replace(/["+\s]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((name) => `VITEST_NATIVE_${name}`),
);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(ts|mts|mjs|cjs|js)$/.test(entry.name) ? [file] : [];
  });
}
// RETIRED_VARIABLES lists bare names ("PLATFORM …"), never a full VITEST_NATIVE_* string,
// so the list itself cannot make a retired name look read.
const SOURCE = sourceFiles(path.join(PACKAGE, "src")).map(read).join("\n");

const NOT_READ = /\b(?:not read|no longer read|does not read|There is no)\b/;

describe("environment variables the docs name", () => {
  it("knows the retired variables", () => {
    expect(RETIRED.has("VITEST_NATIVE_DIAGNOSTICS")).toBe(true);
    expect(RETIRED.has("VITEST_NATIVE_PLATFORM")).toBe(true);
    expect(RETIRED.has("VITEST_NATIVE_NO_REGISTRY")).toBe(false);
  });

  for (const page of PAGES) {
    const name = path.relative(REPO, page);
    it(`${name}: names only variables that do what it says`, () => {
      // Sentence by sentence: a "not read" elsewhere in the paragraph does not excuse one
      // that advertises the variable.
      const sentences = read(page)
        .split(/\n\s*\n/)
        .flatMap((paragraph) => paragraph.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z`])/));
      for (const sentence of sentences) {
        for (const [variable] of sentence.matchAll(/VITEST_NATIVE_[A-Z0-9_]*[A-Z0-9]/g)) {
          if (RETIRED.has(variable)) {
            expect(NOT_READ.test(sentence), `${name} advertises retired ${variable}`).toBe(true);
          } else {
            expect(
              SOURCE.includes(variable),
              `${name} names ${variable}, which nothing reads`,
            ).toBe(true);
          }
        }
      }
    });
  }
});

describe("troubleshooting.md: when the precompiled modules are rebuilt", () => {
  const page = read(path.join(REPO, "website/guide/troubleshooting.md"));
  const section = page.slice(page.indexOf("## When React Native's precompiled modules"));
  const registry = read(path.join(PACKAGE, "src/native/registry.mjs"));
  const keyInputs = registry.slice(registry.indexOf("export function registryKeyInputs"));

  it("lists inputs the cache key hashes", () => {
    for (const pkg of ["react-native", "react", "expo", "@babel/core"]) {
      expect(section).toContain(`\`${pkg}\``);
      expect(keyInputs).toContain(`version("${pkg}")`);
    }
    for (const input of ["ownVersion()", "sourceExts", "assetExts", "BABEL_ENV"]) {
      expect(keyInputs).toContain(input);
    }
    // Source extensions are Metro's, never an option; asset extensions add the option.
    expect(plugin).toContain("sourceExts = [...metro.profile.sourceExts]");
    expect(plugin).toMatch(
      /assetExtensionsFor\(\s*sourceExts,\s*metro\.profile\.assetExts,\s*options\?\.assetExts/,
    );
    expect(section).not.toMatch(/`sourceExts`/);
    expect(section).toMatch(/Metro config.*`assetExts` option/);
    // The file check covers the packages React Native loads, not only its own files.
    expect(section).toMatch(/those they load from other packages such as `react`/);
    expect(registry).toMatch(/for \(const target of \[\.\.\.externals, \.\.\.pinned\]\)/);
    expect(section).toMatch(/size and modification time/);
    expect(registry).toMatch(/st\.size !== size \|\| st\.mtimeMs !== mtimeMs/);
  });

  it("names the directory the registry is written to", () => {
    const named = [...section.matchAll(/node_modules\/\.cache\/vitest-native\/[\w.-]*\/?/g)];
    expect(named.length).toBeGreaterThan(0);
    for (const [dir] of named) expect(dir).toBe("node_modules/.cache/vitest-native/registry/");
    expect(registry).toContain('path.join(cacheRootFor(projectRoot), "registry")');
    const transform = read(path.join(PACKAGE, "src/native/transform.mjs"));
    expect(transform).toContain('path.join(nm, ".cache", "vitest-native")');
    // The project's own node_modules first, whatever it holds; a React Native install
    // above it only when it has none; the temp directory last.
    expect(transform).toMatch(/dir === start\s*\?\s*fs\.existsSync\(nm\)/);
    expect(section).toMatch(/under the Vitest project's root/);
    expect(transform).toContain('path.join(os.tmpdir(), "vitest-native-cache")');
    expect(section).toContain("`vitest-native-cache/registry/`");
  });
});
