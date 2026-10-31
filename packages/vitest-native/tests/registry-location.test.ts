/**
 * The precompiled React Native registry bakes in absolute paths to the packages it
 * resolved, so a cached registry is only valid at the location it was built for.
 *
 * Its key named no location. A checkout copied with its cache (node_modules/.cache
 * included) found the original's registry under the same key, and the manifest check
 * passed because the original's files were still on disk. The copy then loaded React
 * Native from the original checkout against its own React, and every test failed with
 * "more than one copy of React" until the cache was deleted.
 *
 * A symlinked path to the same project is the same location and must keep its cache.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = pathToFileURL(path.join(PACKAGE, "src/native/registry.mjs")).href;
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

/** A project with a one-module React Native and this package's Babel toolchain. */
function project(): { tmp: string; root: string } {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-location-")));
  roots.push(tmp);
  const root = path.join(tmp, "app");
  const nm = path.join(root, "node_modules");
  fs.mkdirSync(path.join(nm, "react-native"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  fs.writeFileSync(
    path.join(nm, "react-native", "package.json"),
    JSON.stringify({ name: "react-native", version: "0.86.0", main: "index.js" }),
  );
  fs.writeFileSync(path.join(nm, "react-native", "index.js"), "module.exports = __filename;\n");
  for (const name of ["@react-native/babel-preset", "@babel/core"]) {
    fs.mkdirSync(path.dirname(path.join(nm, name)), { recursive: true });
    fs.symlinkSync(
      fs.realpathSync(path.join(PACKAGE, "node_modules", name)),
      path.join(nm, name),
      "junction",
    );
  }
  return { tmp, root };
}

// In a child process: this suite's own engine resolves `react-native` for the test
// process, and the registry has to resolve the project's.
function buildRegistry(options: {
  projectRoot: string;
  cacheOnly?: boolean;
  failOnError?: boolean;
}): string | null {
  const out = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { buildRegistry } from ${JSON.stringify(REGISTRY)};
       const file = buildRegistry(${JSON.stringify({ platform: "ios", reactNativeVersion: "0.86.0", ...options })});
       process.stdout.write(JSON.stringify(file));`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(out) as string | null;
}
const cached = (projectRoot: string) => buildRegistry({ projectRoot, cacheOnly: true });

describe("registry cache location", () => {
  it("does not reuse a copied checkout's registry, which points at the original", () => {
    const { tmp, root } = project();
    const built = buildRegistry({ projectRoot: root, failOnError: true });
    expect(built).toEqual(expect.any(String));
    // A control: the original's own cache is a hit, so the miss below is the copy's.
    expect(cached(root)).toBe(built);

    const copy = path.join(tmp, "copy");
    fs.cpSync(root, copy, { recursive: true, verbatimSymlinks: true });
    expect(cached(copy)).toBeNull();

    const rebuilt = buildRegistry({ projectRoot: copy, failOnError: true });
    const source = fs.readFileSync(rebuilt as string, "utf8");
    expect(source).toContain(path.join(copy, "node_modules", "react-native"));
    expect(source).not.toContain(path.join(root, "node_modules", "react-native"));
  });

  it.skipIf(process.platform === "win32")(
    "keeps the cache through a symlinked path to the same project",
    () => {
      const { tmp, root } = project();
      const built = buildRegistry({ projectRoot: root, failOnError: true });
      const link = path.join(tmp, "link");
      fs.symlinkSync(root, link, "dir");
      const hit = cached(link);
      expect(hit).not.toBeNull();
      expect(fs.realpathSync(hit as string)).toBe(fs.realpathSync(built));
    },
  );
});
