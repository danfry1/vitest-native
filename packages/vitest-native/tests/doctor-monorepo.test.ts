/**
 * `doctor` has to describe the run, not the directory it was typed in.
 *
 * Two false reports from a real monorepo migration:
 *
 *   - "engine 'auto' resolves to MOCK: @react-native/babel-preset ... do not
 *     resolve" for a project whose run banner said native. Peers were resolved from
 *     the working directory, and under pnpm a package's node_modules holds only its
 *     DECLARED dependencies, so a hoisted preset does not resolve from there even
 *     though the run finds it.
 *   - "config does not reference vitest-native" for a config that imports a shared
 *     preset which does. Such a file legitimately never mentions vitest-native, and
 *     calling it unconfigured is a false alarm on a working project.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { extendsSharedConfig, resolutionRoot } from "../src/cli/doctor.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A workspace: repo root with a Vitest config, and a package below it without one. */
function workspace(opts: { configAtRoot?: boolean; configInPackage?: boolean }): {
  repo: string;
  pkg: string;
} {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vn-doctor-mono-"));
  roots.push(repo);
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  const pkg = path.join(repo, "packages", "app");
  fs.mkdirSync(pkg, { recursive: true });
  // A real workspace root has a manifest beside its config; that pairing is what
  // marks a project root, so the walk does not accept a stray config above the repo.
  fs.writeFileSync(path.join(repo, "package.json"), '{ "name": "repo" }');
  fs.writeFileSync(path.join(pkg, "package.json"), '{ "name": "app" }');
  if (opts.configAtRoot) fs.writeFileSync(path.join(repo, "vitest.config.ts"), "export default {}");
  if (opts.configInPackage) {
    fs.writeFileSync(path.join(pkg, "vitest.config.ts"), "export default {}");
  }
  return { repo, pkg };
}

describe("resolutionRoot", () => {
  it("walks up to the directory holding the Vitest config", () => {
    const { repo, pkg } = workspace({ configAtRoot: true });
    expect(resolutionRoot(pkg)).toBe(repo);
  });

  it("prefers a config in the package itself", () => {
    const { pkg } = workspace({ configAtRoot: true, configInPackage: true });
    expect(resolutionRoot(pkg)).toBe(pkg);
  });

  it("stays put when there is no config anywhere", () => {
    const { pkg } = workspace({});
    expect(resolutionRoot(pkg)).toBe(pkg);
  });

  it("does not wander out of the repository", () => {
    // The walk stops at the repository boundary rather than climbing into whatever
    // happens to sit above the checkout.
    const { repo, pkg } = workspace({});
    fs.writeFileSync(path.join(path.dirname(repo), "vitest.config.ts"), "export default {}");
    // No manifest beside it, so it is not a project root and is not adopted.
    expect(resolutionRoot(pkg)).toBe(pkg);
  });
});

describe("extendsSharedConfig", () => {
  it("recognises a config re-exporting a shared one", () => {
    expect(
      extendsSharedConfig(`import base from "@scope/vitest-preset";\nexport default base;`),
    ).toBe(true);
  });

  it("recognises a config merging a shared one", () => {
    const source = `import { defineConfig, mergeConfig } from "vitest/config";
import base from "@scope/vitest-preset";
export default mergeConfig(base, defineConfig({ test: {} }));`;
    expect(extendsSharedConfig(source)).toBe(true);
  });

  it("does not count a plain vitest import as extending anything", () => {
    const source = `import { defineConfig } from "vitest/config";
export default defineConfig({ test: {} });`;
    expect(extendsSharedConfig(source)).toBe(false);
  });

  it("does not count an unrelated import that is never exported", () => {
    const source = `import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ test: { root: path.resolve(".") } });`;
    expect(extendsSharedConfig(source)).toBe(false);
  });

  it("ignores a commented-out shared import", () => {
    const source = `// import base from "@scope/vitest-preset";
export default {};`;
    expect(extendsSharedConfig(source)).toBe(false);
  });
});
