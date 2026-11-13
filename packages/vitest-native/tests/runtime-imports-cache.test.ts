/**
 * #763: a React Native library that declares no `react-native` dependency or peer is
 * invisible to manifest detection. Its runtime graph says what its manifest does not, but
 * walking every declared package's graph costs 258–671 ms per config evaluation in real
 * apps, so each package's answer is cached on disk until its installed manifest changes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";
import {
  RUNTIME_IMPORTS_CACHE_FILE,
  openRuntimeImportsCache,
  patchedPackages,
} from "../src/native/runtime-imports-cache.js";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-rt-cache-")));
  dirs.push(dir);
  return dir;
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Install `name` under root/node_modules with `source` as its index.js. */
function install(root: string, name: string, source: string, version = "1.0.0"): string {
  const dir = path.join(root, "node_modules", ...name.split("/"));
  write(path.join(dir, "package.json"), JSON.stringify({ name, version, main: "index.js" }));
  write(path.join(dir, "index.js"), source);
  return dir;
}

/** Push package.json's mtime forward, as a reinstall would, without changing its text. */
function touch(file: string): void {
  const later = new Date(fs.statSync(file).mtimeMs + 5000);
  fs.utimesSync(file, later, later);
}

describe("the runtime-imports cache", () => {
  it("returns a stored answer while the installed manifest is unchanged", () => {
    const root = tmp();
    const dir = install(root, "lib", "");
    const file = path.join(root, "cache.json");
    const first = openRuntimeImportsCache(file);
    expect(first.get(dir)).toBe(undefined);
    first.set(dir, new Set(["react-native", "lodash"]));
    expect(first.flush()).toBe(true);

    const second = openRuntimeImportsCache(file);
    expect(second.get(dir)).toEqual(new Set(["lodash", "react-native"]));
    expect(second.stats).toEqual({ hits: 1, misses: 0, uncacheable: 0 });
    expect(second.flush()).toBe(false);
  });

  it("drops the answer when the version changes, or a reinstall rewrites package.json", () => {
    const root = tmp();
    const dir = install(root, "lib", "");
    const file = path.join(root, "cache.json");
    const write1 = openRuntimeImportsCache(file);
    write1.set(dir, new Set(["react-native"]));
    write1.flush();

    touch(path.join(dir, "package.json"));
    expect(openRuntimeImportsCache(file).get(dir)).toBe(undefined);

    const write2 = openRuntimeImportsCache(file);
    write2.set(dir, new Set(["react-native"]));
    write2.flush();
    install(root, "lib", "", "1.0.1");
    expect(openRuntimeImportsCache(file).get(dir)).toBe(undefined);
  });

  it("never caches a package outside node_modules", () => {
    const root = tmp();
    const dir = path.join(root, "packages", "lib");
    write(path.join(dir, "package.json"), JSON.stringify({ name: "lib", version: "1.0.0" }));
    const file = path.join(root, "cache.json");
    const cache = openRuntimeImportsCache(file);
    cache.set(dir, new Set(["react-native"]));
    expect(cache.flush()).toBe(false);
    expect(cache.get(dir)).toBe(undefined);
    expect(cache.stats.uncacheable).toBe(1);
  });

  it("never caches a patched package", () => {
    const root = tmp();
    const scoped = install(root, "@scope/lib", "");
    const plain = install(root, "plain", "");
    write(path.join(root, "patches", "@scope+lib+1.0.0.patch"), "");
    write(
      path.join(root, "package.json"),
      JSON.stringify({ name: "app", pnpm: { patchedDependencies: { "plain@1.0.0": "p.patch" } } }),
    );
    const patched = patchedPackages([root]);
    expect(patched).toEqual(new Set(["@scope/lib@1.0.0", "plain@1.0.0"]));
    const cache = openRuntimeImportsCache(path.join(root, "cache.json"), patched);
    cache.set(scoped, new Set(["react-native"]));
    cache.set(plain, new Set(["react-native"]));
    expect(cache.flush()).toBe(false);
    expect(cache.stats.uncacheable).toBe(0);
    expect(cache.get(scoped)).toBe(undefined);
    expect(cache.stats.uncacheable).toBe(1);
  });

  it("reads bun's top-level patchedDependencies, by name and version or by name", () => {
    const root = tmp();
    write(
      path.join(root, "package.json"),
      JSON.stringify({ patchedDependencies: { "a@2.0.0": "x", b: "y" } }),
    );
    expect(patchedPackages([root])).toEqual(new Set(["a@2.0.0", "b"]));
    const dir = install(root, "b", "", "3.1.4");
    const cache = openRuntimeImportsCache(null, patchedPackages([root]));
    cache.set(dir, new Set());
    expect(cache.get(dir)).toBe(undefined);
    expect(cache.stats.uncacheable).toBe(1);
  });

  it("treats a malformed or older-format file as empty", () => {
    const root = tmp();
    const dir = install(root, "lib", "");
    const file = path.join(root, "cache.json");
    write(file, "{ not json");
    expect(openRuntimeImportsCache(file).get(dir)).toBe(undefined);
    const good = openRuntimeImportsCache(file);
    good.set(dir, new Set(["x"]));
    good.flush();
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    write(file, JSON.stringify({ ...stored, version: 0 }));
    expect(openRuntimeImportsCache(file).get(dir)).toBe(undefined);
  });

  it("writes through a temporary file it renames, leaving none behind", () => {
    const root = tmp();
    const dir = install(root, "lib", "");
    const file = path.join(root, "deep", "cache.json");
    const cache = openRuntimeImportsCache(file);
    cache.set(dir, new Set());
    expect(cache.flush()).toBe(true);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["cache.json"]);
  });
});

describe("detection of a library that imports react-native without declaring it (#763)", () => {
  /** An app declaring `quiet-rn` (imports react-native, declares nothing) and `plain`. */
  function app(): { root: string; lib: string } {
    const root = tmp();
    write(
      path.join(root, "package.json"),
      JSON.stringify({ name: "app", dependencies: { "quiet-rn": "1.0.0", plain: "1.0.0" } }),
    );
    const lib = install(root, "quiet-rn", 'module.exports = require("./view");');
    write(
      path.join(lib, "view.js"),
      'const { View } = require("react-native"); module.exports = View;',
    );
    install(root, "plain", 'module.exports = require("lodash");');
    install(root, "react-native", "", "0.86.3");
    return { root, lib };
  }
  const detect = (root: string, cacheFile: string | null | undefined) =>
    detectEcosystemPackages(root, [], [], [], [], undefined, {
      undeclaredReactNative: cacheFile === undefined ? undefined : { cacheFile },
    });

  it("is off unless asked for", () => {
    expect(detect(app().root, undefined)).not.toContain("quiet-rn");
  });

  it("detects it through its runtime graph, and not a package that never imports react-native", () => {
    const detected = detect(app().root, null);
    expect(detected).toContain("quiet-rn");
    expect(detected).not.toContain("plain");
  });

  it("leaves a workspace member's source to Vite", () => {
    const root = tmp();
    write(
      path.join(root, "package.json"),
      JSON.stringify({ name: "app", dependencies: { member: "file:./member" } }),
    );
    const member = path.join(root, "member");
    write(path.join(member, "package.json"), JSON.stringify({ name: "member", main: "index.js" }));
    write(path.join(member, "index.js"), 'require("react-native");');
    fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
    fs.symlinkSync(member, path.join(root, "node_modules", "member"), "junction");
    expect(detect(root, null)).not.toContain("member");
  });

  it("answers a second run from the cache, and walks again once package.json changes", () => {
    const { root, lib } = app();
    const cacheFile = path.join(
      root,
      "node_modules",
      ".cache",
      "vitest-native",
      RUNTIME_IMPORTS_CACHE_FILE,
    );
    expect(detect(root, cacheFile)).toContain("quiet-rn");
    expect(fs.existsSync(cacheFile)).toBe(true);

    // The source changes but package.json does not: the stored answer stands.
    write(path.join(lib, "view.js"), "module.exports = null;");
    expect(detect(root, cacheFile)).toContain("quiet-rn");

    // A reinstall rewrites package.json: the package is walked again.
    touch(path.join(lib, "package.json"));
    expect(detect(root, cacheFile)).not.toContain("quiet-rn");
  });
});
