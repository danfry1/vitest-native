/**
 * A preset shadows a package by name. When the project installs that name from a fork
 * (git, a local path, a tarball URL or an npm alias), the fork never loads in tests and
 * whatever it adds is undefined. Doctor names the source and the per-preset opt-out (#761).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { declaredSpec, nonRegistrySource, runDoctor } from "../src/cli/doctor.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A project with react-native-webview installed and declared as `manifest` says. */
function project(manifest: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-doctor-fork-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app", ...manifest }));
  const dir = path.join(root, "node_modules", "react-native-webview");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "react-native-webview", version: "13.16.0", main: "index.js" }),
  );
  fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};");
  return root;
}

const forkWarning = (root: string) =>
  runDoctor(root, "22.22.3").lines.find((l) => l.includes("replaces it by name"));

describe("doctor: a preset-shadowed package installed from a fork (#761)", () => {
  it("warns for a git dependency and names the opt-out", () => {
    const line = forkWarning(
      project({ dependencies: { "react-native-webview": "some-org/react-native-webview#abc123" } }),
    );
    expect(line).toMatch(/^ {2}⚠ react-native-webview is installed from git/);
    expect(line).toContain("some-org/react-native-webview#abc123");
    expect(line).toContain("the webview preset");
    expect(line).toContain("`presets: { webview: false }`");
  });

  it("reads devDependencies and a top-level override", () => {
    expect(
      forkWarning(project({ devDependencies: { "react-native-webview": "file:../webview" } })),
    ).toContain("a local path (file:../webview)");
    expect(
      forkWarning(
        project({
          dependencies: { "react-native-webview": "13.16.0" },
          overrides: { "react-native-webview": "github:some-org/react-native-webview" },
        }),
      ),
    ).toContain("git (github:some-org/react-native-webview)");
    // npm's "$name" override defers to the dependency's spec, which is the fork here.
    expect(
      forkWarning(
        project({
          dependencies: { "react-native-webview": "some-org/react-native-webview" },
          overrides: { "react-native-webview": "$react-native-webview" },
        }),
      ),
    ).toContain("git (some-org/react-native-webview)");
  });

  it("stays quiet for a registry version, and for an override pointing back at it", () => {
    expect(forkWarning(project({ dependencies: { "react-native-webview": "^13.16.0" } }))).toBe(
      undefined,
    );
    expect(
      forkWarning(
        project({
          dependencies: { "react-native-webview": "13.16.0" },
          overrides: { "react-native-webview": "$react-native-webview" },
        }),
      ),
    ).toBe(undefined);
  });
});

describe("nonRegistrySource", () => {
  const pkg = "react-native-webview";
  it.each([
    ["git+https://github.com/o/r.git#v1", "git"],
    ["git@github.com:o/r.git", "git"],
    ["github:o/r", "git"],
    ["gitlab:o/r#main", "git"],
    ["https://github.com/o/r", "git"],
    ["https://example.com/r.git#v2", "git"],
    ["o/r", "git"],
    ["o/r#sha", "git"],
    ["file:../r", "a local path"],
    ["link:../r", "a local path"],
    ["portal:../r", "a local path"],
    ["workspace:*", "a local path"],
    ["../r", "a local path"],
    ["https://example.com/r-1.0.0.tgz", "a URL"],
    ["npm:@o/webview-fork@1.0.0", "the npm package @o/webview-fork"],
  ])("%s is %s", (spec, kind) => {
    expect(nonRegistrySource(pkg, spec)).toBe(`${kind} (${spec})`);
  });

  it.each([
    "13.16.0",
    "^13.16.0",
    "~13",
    ">=13 <14",
    "13.x",
    "latest",
    "*",
    "",
    "npm:react-native-webview@13",
  ])("%j is the registry", (spec) => {
    expect(nonRegistrySource(pkg, spec)).toBe(null);
  });
});

describe("declaredSpec", () => {
  it("prefers the override to the dependency, and the first root that names it", () => {
    const a = project({
      dependencies: { "react-native-webview": "13.16.0" },
      resolutions: { "react-native-webview": "o/r" },
    });
    const b = project({ dependencies: { "react-native-webview": "file:x" } });
    expect(declaredSpec([a, b], "react-native-webview")).toBe("o/r");
    expect(declaredSpec([path.join(a, "missing"), b], "react-native-webview")).toBe("file:x");
    expect(
      declaredSpec(
        [project({ pnpm: { overrides: { "react-native-webview": "link:y" } } })],
        "react-native-webview",
      ),
    ).toBe("link:y");
  });
});
