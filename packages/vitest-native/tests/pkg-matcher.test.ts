import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error — runtime .mjs, no types
import { buildPkgMatcher } from "../src/native/match.mjs";

/** A project with `name` installed under node_modules, plus a decoy directory. */
function fixture(name: string): { root: string; installed: string; decoy: string } {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-match-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  const installed = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(installed, { recursive: true });
  fs.writeFileSync(
    path.join(installed, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "index.js" }),
  );
  fs.writeFileSync(path.join(installed, "index.js"), "module.exports = {};");
  // A directory that merely shares the package's name — a source folder, or a
  // sibling project in a workspace.
  const decoy = path.join(root, "src", ...name.split("/"));
  fs.mkdirSync(decoy, { recursive: true });
  return { root, installed, decoy };
}

describe("buildPkgMatcher", () => {
  it("matches the installed package", () => {
    const { root, installed } = fixture("some-lib");
    const isExtra = buildPkgMatcher(["some-lib"], root);
    expect(isExtra(path.join(installed, "index.js"))).toBe(true);
    expect(isExtra(path.join(installed, "lib", "deep", "file.js"))).toBe(true);
  });

  it("does not match a directory that merely shares the package's name", () => {
    // The bug this replaces: a bare `[/\]name[/\]` test claimed every file under any
    // directory of that name. A packed-consumer fixture in a folder called `expo`
    // had this package's own runtime compiled as if it were third-party source.
    const { root, decoy } = fixture("expo");
    const isExtra = buildPkgMatcher(["expo"], root);
    expect(isExtra(path.join(decoy, "anything.js"))).toBe(false);
    expect(isExtra(path.join(root, "expo", "app", "index.js"))).toBe(false);
  });

  it("matches a scoped package without matching its scope directory", () => {
    const { root, installed, decoy } = fixture("@acme/widgets");
    const isExtra = buildPkgMatcher(["@acme/widgets"], root);
    expect(isExtra(path.join(installed, "index.js"))).toBe(true);
    expect(isExtra(path.join(decoy, "index.js"))).toBe(false);
  });

  it("matches a linked package that lives outside node_modules", () => {
    // Workspace and `file:` dependencies resolve to their real path, which has no
    // node_modules segment — anchoring on node_modules alone would drop them.
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-link-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
    const real = path.join(root, "packages", "linked-lib");
    fs.mkdirSync(real, { recursive: true });
    fs.writeFileSync(
      path.join(real, "package.json"),
      JSON.stringify({ name: "linked-lib", version: "1.0.0", main: "index.js" }),
    );
    fs.writeFileSync(path.join(real, "index.js"), "module.exports = {};");
    fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
    fs.symlinkSync(real, path.join(root, "node_modules", "linked-lib"), "dir");

    const isExtra = buildPkgMatcher(["linked-lib"], root);
    expect(isExtra(path.join(real, "index.js"))).toBe(true);
    expect(isExtra(path.join(real, "src", "deep.js"))).toBe(true);
  });

  it("still matches installed packages without a project root", () => {
    // The loader hook resolves its root from init data; without one, the
    // node_modules rule alone has to keep working.
    const isExtra = buildPkgMatcher(["some-lib"]);
    expect(isExtra("/x/node_modules/some-lib/index.js")).toBe(true);
    expect(isExtra("/x/src/some-lib/index.js")).toBe(false);
  });

  it("matches nothing when given no packages", () => {
    expect(buildPkgMatcher([])("/x/node_modules/anything/index.js")).toBe(false);
    expect(buildPkgMatcher(undefined)("/x/node_modules/anything/index.js")).toBe(false);
  });
});
