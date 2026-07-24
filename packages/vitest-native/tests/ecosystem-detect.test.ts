import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";

/** A throwaway project with the given packages installed. */
function project(manifest: Record<string, unknown>, installed: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-eco-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "app", ...manifest }));
  for (const [name, pkg] of Object.entries(installed)) {
    const target = path.join(dir, "node_modules", ...name.split("/"));
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "package.json"),
      JSON.stringify({ name, version: "1.0.0", main: "index.js", ...(pkg as object) }),
    );
    fs.writeFileSync(path.join(target, "index.js"), "module.exports = {};");
  }
  return dir;
}

const rnDep = { peerDependencies: { "react-native": "*" } };

describe("detectEcosystemPackages", () => {
  it("finds packages that declare react-native, by manifest rather than by name", () => {
    const dir = project(
      { dependencies: { "@gorhom/some-sheet": "1", "plain-utils": "1", "react-native-ish": "1" } },
      {
        // Scoped, so a `react-native-*` name heuristic would have missed it.
        "@gorhom/some-sheet": rnDep,
        // Unrelated package that happens to be a dependency.
        "plain-utils": {},
        // Named like an RN package but does not depend on one.
        "react-native-ish": {},
      },
    );
    expect(detectEcosystemPackages(dir)).toEqual(["@gorhom/some-sheet"]);
  });

  it("accepts a runtime dependency on react-native, not only a peer one", () => {
    const dir = project(
      { dependencies: { "some-lib": "1" } },
      { "some-lib": { dependencies: { "react-native": "0.86.0" } } },
    );
    expect(detectEcosystemPackages(dir)).toEqual(["some-lib"]);
  });

  it("skips packages a preset already shadows", () => {
    // Their real source never loads, so inlining it would be wasted work.
    const dir = project(
      { dependencies: { "react-native-reanimated": "1" } },
      { "react-native-reanimated": rnDep },
    );
    expect(detectEcosystemPackages(dir)).toEqual([]);
  });

  it("never inlines the test infrastructure", () => {
    // A second copy of RNTL or a renderer in the graph has corrupted rendering
    // before, in ways that surface as unrelated act() and host-name failures.
    const dir = project(
      { devDependencies: { "@testing-library/react-native": "1", "react-test-renderer": "1" } },
      { "@testing-library/react-native": rnDep, "react-test-renderer": rnDep },
    );
    expect(detectEcosystemPackages(dir)).toEqual([]);
  });

  it("yields to an explicit transform entry", () => {
    // `transform` keeps its existing meaning — externalized, compiled by the Node
    // hooks — so listing a package there has to win over auto-inlining it.
    const dir = project({ dependencies: { "some-lib": "1" } }, { "some-lib": rnDep });
    expect(detectEcosystemPackages(dir)).toEqual(["some-lib"]);
    expect(detectEcosystemPackages(dir, ["some-lib"])).toEqual([]);
  });

  it("ignores declared packages that are not installed", () => {
    const dir = project({ dependencies: { "never-installed": "1" } }, {});
    expect(detectEcosystemPackages(dir)).toEqual([]);
  });

  it("returns nothing for a project without a readable manifest", () => {
    expect(detectEcosystemPackages(fs.mkdtempSync(path.join(os.tmpdir(), "vn-none-")))).toEqual([]);
  });
});
