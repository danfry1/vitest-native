/**
 * Disk-cache behavior of the native-engine transform: project-local cache
 * location, content-hash keying, and lazy @babel/core loading on warm caches.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
// @ts-expect-error — runtime .mjs, no types
import { transformRN, transformCacheDir, cacheRootFor } from "../src/native/transform.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findUp(rel: string, start: string): string {
  let dir = start;
  for (;;) {
    const candidate = path.join(dir, rel);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${rel} not found from ${start}`);
    dir = parent;
  }
}
const projectRoot = path.dirname(findUp("package.json", HERE));

describe("cacheRootFor", () => {
  it("prefers the project's node_modules/.cache when node_modules exists", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-cacheroot-"));
    try {
      fs.mkdirSync(path.join(tmp, "node_modules"));
      const root = cacheRootFor(tmp);
      expect(root).toBe(path.join(tmp, "node_modules", ".cache", "vitest-native"));
      expect(fs.existsSync(root)).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("falls back to tmpdir when node_modules is absent", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-cacheroot-"));
    try {
      const root = cacheRootFor(tmp);
      expect(root).toBe(path.join(os.tmpdir(), "vitest-native-cache"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("transform disk cache", () => {
  it("keys entries by content hash, not path/mtime — CI-restore friendly", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-contentkey-"));
    try {
      const src = "// @flow\ntype T = string;\nmodule.exports = (x: T) => x;";
      const fileA = path.join(dir, "a.js");
      const fileB = path.join(dir, "b.js");
      fs.writeFileSync(fileA, src);
      fs.writeFileSync(fileB, src);
      transformRN(fileA, src, projectRoot);
      const cacheDir = transformCacheDir();
      expect(cacheDir).toBeTruthy();
      // Same content at a DIFFERENT path (and different mtime) hits the same
      // disk entry: the entry count must not grow.
      const entriesAfterA = fs.readdirSync(cacheDir).length;
      transformRN(fileB, src, projectRoot);
      expect(fs.readdirSync(cacheDir).length).toBe(entriesAfterA);
      // The cache directory name carries preset + babel versions.
      expect(path.basename(cacheDir)).toMatch(/^transform-.+-b.+-v\d+$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not load @babel/core when every file is served from the disk cache", () => {
    // Two subprocesses sharing the disk cache: the first (cold) must load
    // Babel; the second (warm) must serve from disk without ever requiring it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-lazybabel-"));
    try {
      const file = path.join(dir, "mod.js");
      // Unique content per test invocation: the disk cache is content-keyed and
      // shared across runs, so a constant source would make the "cold" run warm.
      fs.writeFileSync(
        file,
        `// @flow\n// ${crypto.randomUUID()}\ntype Q = number;\nmodule.exports = (q: Q) => q + 1;`,
      );
      const script = `
        import { transformRN } from ${JSON.stringify(
          path.join(projectRoot, "src", "native", "transform.mjs"),
        )};
        import fs from "node:fs";
        const file = ${JSON.stringify(file)};
        transformRN(file, fs.readFileSync(file, "utf8"), ${JSON.stringify(projectRoot)});
        const { default: Module } = await import("node:module");
        // The version read (@babel/core/package.json) is cheap and expected on
        // both runs; "loaded" means Babel's actual entry module was required.
        const loadedBabel = Object.keys(Module._cache ?? {}).some(
          (p) => p.includes(${JSON.stringify(path.join("@babel", "core") + path.sep)}) &&
            !p.endsWith("package.json"),
        );
        console.log("BABEL_LOADED=" + loadedBabel);
      `;
      const run = () =>
        execFileSync(process.execPath, ["--input-type=module", "-e", script], {
          encoding: "utf8",
        });
      const cold = run();
      expect(cold).toContain("BABEL_LOADED=true");
      const warm = run();
      expect(warm).toContain("BABEL_LOADED=false");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
