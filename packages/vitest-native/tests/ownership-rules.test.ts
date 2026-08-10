/**
 * The externalization patterns handed to Vitest and the matcher the loader uses must
 * describe the same set of files.
 *
 * They are two consumers of one rule (`packagePatterns` in native/match.mjs), but
 * they were two implementations of it for a long time, and three defects in this area
 * were one of them disagreeing with the other: a resolved-directory anchor the
 * transform side applied and the config side did not, a `node_modules` rule that also
 * matched any folder sharing a package's name, and a separator mismatch that only
 * showed up on Windows.
 *
 * Vitest's `server.deps.external` takes patterns rather than a predicate, so the two
 * sides cannot literally be the same call. This asserts the next best thing: for the
 * same package and root, they answer identically — including for a path written the
 * way Windows writes one.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildPkgMatcher } from "../src/native/match.mjs";
import { nativeEngineConfig } from "../src/native/apply.js";

const made: string[] = [];
afterAll(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

/** A project with one installed package and one workspace-style linked package. */
function project(): { root: string; installed: string; linked: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-own-")));
  made.push(root);
  write(path.join(root, "package.json"), {
    name: "@w/app",
    dependencies: { "@w/installed": "1.0.0", "@w/linked": "1.0.0" },
  });
  const installed = path.join(root, "node_modules", "@w", "installed");
  write(path.join(installed, "package.json"), { name: "@w/installed", version: "1.0.0" });
  // Resolvable by name but living outside node_modules — the shape a workspace or
  // `file:` dependency has, and the only reason the resolved-directory anchor exists.
  // It has to be a real link: a copy under node_modules would resolve to the copy and
  // never exercise that anchor at all, which is how the first version of this fixture
  // tested nothing.
  const linked = path.join(root, "vendor", "linked");
  write(path.join(linked, "package.json"), { name: "@w/linked", version: "1.0.0" });
  fs.mkdirSync(path.join(root, "node_modules", "@w"), { recursive: true });
  fs.symlinkSync(
    linked,
    path.join(root, "node_modules", "@w", "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return { root, installed, linked };
}

/** Whether Vitest would externalize this id, given the engine's config. */
function externalizes(root: string, names: string[], id: string): boolean {
  const external = nativeEngineConfig(
    "/setup.mjs",
    {},
    [".js"],
    names,
    undefined,
    undefined,
    undefined,
    [],
    root,
  ).test.server.deps.external as RegExp[];
  return external.some((re) => re.test(id));
}

describe("the two sides of the ownership rule", () => {
  const posix = (p: string) => p.replace(/\\/g, "/");

  it("agree on every kind of path", () => {
    const { root, installed, linked } = project();
    const names = ["@w/installed", "@w/linked"];
    const matches = buildPkgMatcher(names, root);
    const probes = [
      path.join(installed, "index.js"),
      path.join(linked, "index.js"),
      path.join(root, "src", "app.ts"), // the project's own source
      path.join(root, "node_modules", "@w", "unrelated", "index.js"),
      // A directory that merely shares a package's name — the over-match that once
      // made every file beneath a folder called `expo` look like third-party source.
      path.join(root, "src", "installed", "thing.ts"),
    ];
    for (const probe of probes) {
      expect({ probe, external: externalizes(root, names, posix(probe)) }).toEqual({
        probe,
        external: matches(probe),
      });
    }
  });

  it("agree on a Windows-style path", () => {
    // The matcher is handed whatever Node reports, which on Windows uses backslashes,
    // while the patterns are written with forward slashes because that is the form
    // Vitest presents module ids in. A test comparing only POSIX paths passed on every
    // platform while the two sides disagreed on one of them.
    const { root, linked } = project();
    const names = ["@w/linked"];
    const matches = buildPkgMatcher(names, root);
    expect(matches(path.join(linked, "index.js").replace(/\//g, "\\"))).toBe(true);
    expect(matches(path.join(root, "src", "app.ts").replace(/\//g, "\\"))).toBe(false);
  });

  it("neither side claims a directory that merely shares a package's name", () => {
    // Agreement alone cannot catch this: both sides read the same rule, so loosening
    // it leaves them agreeing on the wrong answer. The rule itself is asserted here.
    // A project folder called `expo` once made every file beneath it look like
    // third-party source, and this package's own runtime was compiled as a result.
    const { root } = project();
    const unscoped = path.join(root, "node_modules", "widgets");
    write(path.join(unscoped, "package.json"), { name: "widgets", version: "1.0.0" });
    const namesake = posix(path.join(root, "src", "widgets", "Button.tsx"));
    expect(buildPkgMatcher(["widgets"], root)(namesake)).toBe(false);
    expect(externalizes(root, ["widgets"], namesake)).toBe(false);
    // ...while the real package still matches.
    const real = posix(path.join(unscoped, "index.js"));
    expect(buildPkgMatcher(["widgets"], root)(real)).toBe(true);
    expect(externalizes(root, ["widgets"], real)).toBe(true);
  });

  it("neither side claims the project itself", () => {
    // A package resolving to the project root is the project. Both sides must drop
    // the directory anchor, or Vitest hands the project's own test files to Node.
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-own-self-")));
    made.push(root);
    write(path.join(root, "package.json"), {
      name: "@w/self",
      exports: { ".": "./index.js", "./package.json": "./package.json" },
    });
    const source = posix(path.join(root, "src", "app.test.ts"));
    expect(buildPkgMatcher(["@w/self"], root)(source)).toBe(false);
    expect(externalizes(root, ["@w/self"], source)).toBe(false);
  });
});
