/**
 * Node resolution walks UPWARD, so the directory a command runs in already sees its
 * own dependencies and everything declared above it. Resolving from higher up can
 * only ever see less.
 *
 * An earlier version of this resolved unconditionally from the directory holding the
 * Vitest config. That lost dependencies a package declared itself and reported a
 * missing peer for a project that had one — the inverse of the bug it was written
 * for, and caught only by constructing the layout and checking both directions.
 *
 * The config root is now consulted only when something does not resolve where the
 * command was run, which is the case where it was invoked above the package that
 * declares it.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolutionRoot } from "../src/cli/doctor.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function workspace(depIn: "app" | "root"): { repo: string; app: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vn-fallback-"));
  roots.push(repo);
  fs.mkdirSync(path.join(repo, ".git"));
  fs.writeFileSync(path.join(repo, "package.json"), '{"name":"repo"}');
  fs.writeFileSync(path.join(repo, "vitest.config.ts"), "export default {}");
  const app = path.join(repo, "packages", "app");
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, "package.json"), '{"name":"app"}');
  const host = depIn === "app" ? app : repo;
  const dep = path.join(host, "node_modules", "fake-dep");
  fs.mkdirSync(dep, { recursive: true });
  fs.writeFileSync(
    path.join(dep, "package.json"),
    '{"name":"fake-dep","version":"1.0.0","main":"i.js"}',
  );
  fs.writeFileSync(path.join(dep, "i.js"), "module.exports={};");
  return { repo, app };
}

const resolves = (dir: string): boolean => {
  try {
    createRequire(path.join(dir, "package.json")).resolve("fake-dep");
    return true;
  } catch {
    return false;
  }
};

describe("doctor resolution", () => {
  it("sees a dependency the package declares itself", () => {
    // The regression: resolutionRoot picks the repo root here, and the dep is NOT
    // visible from there. Resolving from the invocation directory is what works.
    const { repo, app } = workspace("app");
    expect(resolutionRoot(app)).toBe(repo);
    expect(resolves(app)).toBe(true);
    expect(resolves(repo)).toBe(false);
  });

  it("sees a dependency declared above it, because resolution walks up", () => {
    const { repo, app } = workspace("root");
    expect(resolves(app)).toBe(true);
    expect(resolves(repo)).toBe(true);
  });

  it("offers the config root for the case the invocation directory cannot see", () => {
    // Running from the repo root cannot reach a dep declared in a package below:
    // Node has no downward walk. That is the case the fallback exists for.
    const { repo, app } = workspace("app");
    expect(resolves(repo)).toBe(false);
    expect(resolutionRoot(app)).toBe(repo);
  });
});
