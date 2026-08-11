/**
 * `transform: { exclude: [...] }` — the escape hatch for the engine guessing wrong.
 *
 * Deciding which packages are untranspiled React Native source is a heuristic, and
 * when it guesses wrong the failure is a parse error deep inside a package the project
 * never named. Build toolchains are the recurring case: compiling one re-enters Babel
 * while it is loading. The engine carries built-in exclusions for the ones it knows
 * about — `@babel/core`, the Babel preset, `@babel/runtime`, Metro, React, the test
 * renderers — but every name on that list was learned from a package that broke, which
 * makes the list exactly as current as the last release.
 *
 * `exclude` is the same decision handed to the project, so a team hitting the next one
 * can unblock itself the same day. It overrides everything that would otherwise select
 * a package: auto-detection, a detected package's dependency closure, the built-in
 * lists, and an `include` in the same config.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";
import { normalizeTransformOption } from "../src/plugin.js";
import { validateOptions } from "../src/validate.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A project declaring `rn-lib`, which drags `helper` in through its closure. */
function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-exclude-"));
  roots.push(root);
  const write = (name: string, manifest: Record<string, unknown>) => {
    const dir = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, ...manifest }));
  };
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "app", dependencies: { "rn-lib": "*" } }),
  );
  write("react-native", {});
  write("rn-lib", { peerDependencies: { "react-native": "*" }, dependencies: { helper: "*" } });
  write("helper", {});
  return root;
}

describe("the transform option's two shapes", () => {
  it("reads an array as the include list", () => {
    expect(normalizeTransformOption(["a", "b"])).toEqual({ include: ["a", "b"], exclude: [] });
  });

  it("reads an object as both lists", () => {
    expect(normalizeTransformOption({ include: ["a"], exclude: ["b"] })).toEqual({
      include: ["a"],
      exclude: ["b"],
    });
  });

  it("lets exclude win over include in the same config", () => {
    // A contradiction has to resolve somewhere, and this is the safer direction: not
    // compiling something surfaces as a legible syntax error in a named package, while
    // compiling the wrong thing crashes inside Babel naming a file nobody recognises.
    expect(normalizeTransformOption({ include: ["a", "b"], exclude: ["b"] })).toEqual({
      include: ["a"],
      exclude: ["b"],
    });
  });

  it("ignores absent, empty and non-string entries", () => {
    expect(normalizeTransformOption(undefined)).toEqual({ include: [], exclude: [] });
    expect(normalizeTransformOption({})).toEqual({ include: [], exclude: [] });
    expect(normalizeTransformOption(["a", "", 7 as unknown as string])).toEqual({
      include: ["a"],
      exclude: [],
    });
  });
});

describe("transform.exclude overrides every route into the transform set", () => {
  it("drops a package that auto-detection would have claimed", () => {
    expect(detectEcosystemPackages(project())).toContain("rn-lib");
    expect(detectEcosystemPackages(project(), [], [], ["rn-lib"])).not.toContain("rn-lib");
  });

  it("drops a package reached only through a closure", () => {
    // The route that produced every toolchain crash so far: the project never named
    // it, so `transform: [...]` was no help and neither was removing anything.
    expect(detectEcosystemPackages(project())).toContain("helper");
    const detected = detectEcosystemPackages(project(), [], [], ["helper"]);
    expect(detected).not.toContain("helper");
    expect(detected, "excluding a closure member leaves its parent alone").toContain("rn-lib");
  });
});

describe("transform option validation", () => {
  const check = (transform: unknown) => () => validateOptions({ transform } as never);

  it("accepts both shapes", () => {
    expect(check(["a"])).not.toThrow();
    expect(check({ include: ["a"] })).not.toThrow();
    expect(check({ exclude: ["a"] })).not.toThrow();
    expect(check({ include: ["a"], exclude: ["b"] })).not.toThrow();
  });

  it("names the mistake rather than the shape", () => {
    // "must be an array" would be wrong advice now that the object form exists.
    expect(check("react-native-reanimated")).toThrow(/array of package names, or an object/);
    expect(check({ includes: ["a"] })).toThrow(/only "include" and "exclude".*"includes"/s);
    expect(check({ exclude: [7] })).toThrow(/transform\.exclude/);
  });
});
