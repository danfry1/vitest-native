/**
 * doctor and a config that builds on a shared module through a relative import: a
 * monorepo package's vitest.config.ts merging ../../vitest.shared.ts, which imports
 * vitest-native and calls reactNative(). The package's own file never mentions
 * vitest-native, so "does not import vitest-native" was a false alarm. The config's
 * relative imports are followed; when that cannot settle it, doctor says it couldn't
 * confirm, not that the config doesn't.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runDoctor, sharedConfigUse } from "../src/cli/doctor.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

const USES = `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
export default defineConfig({ plugins: [reactNative()] });
`;
const PACKAGE_CONFIG = (
  specifier: string,
) => `import { defineConfig, mergeConfig } from "vitest/config";
import shared from "${specifier}";
export default mergeConfig(shared, defineConfig({ test: { include: ["src/**/*.test.ts"] } }));
`;

/** A repo with packages/app; `files` are written relative to the repo root. */
function repo(files: Record<string, string>): { root: string; pkg: string; config: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-doctor-shared-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, "package.json"), '{ "name": "repo" }');
  fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages", "app", "package.json"), '{ "name": "app" }');
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  const pkg = path.join(root, "packages", "app");
  return { root, pkg, config: path.join(pkg, "vitest.config.ts") };
}

const configLines = (pkg: string) => {
  const lines = runDoctor(pkg).lines;
  return lines.slice(lines.indexOf("Config")).join("\n");
};

describe("doctor: a config built on a shared module", () => {
  it("passes when a relative import uses vitest-native, and names it", () => {
    const { pkg } = repo({
      "vitest.shared.ts": USES,
      "packages/app/vitest.config.ts": PACKAGE_CONFIG("../../vitest.shared"),
    });
    const out = configLines(pkg);
    expect(out).toContain("✓ vitest.config.ts uses vitest-native through ../../vitest.shared.ts.");
    expect(out).not.toContain("does not import vitest-native");
    expect(out).not.toContain("couldn't confirm");
  });

  it("follows a chain a few modules deep, TypeScript's .js spelling and a directory index", () => {
    const { config } = repo({
      "config/vitest/index.ts": USES,
      "config/base.ts": `export { default } from "./vitest/index.js";\n`,
      "vitest.shared.mts": `import base from "./config/base.js";\nexport default base;\n`,
      "packages/app/vitest.config.ts": PACKAGE_CONFIG("../../vitest.shared.mjs"),
    });
    expect(sharedConfigUse(config)).toEqual({
      via: "../../config/vitest/index.ts",
      unconfirmed: null,
    });
  });

  it("survives an import cycle", () => {
    const { config } = repo({
      "a.ts": `import b from "./b";\nexport default b;\n`,
      "b.ts": `import a from "./a";\nexport default a;\n`,
      "packages/app/vitest.config.ts": PACKAGE_CONFIG("../../a"),
    });
    expect(sharedConfigUse(config)).toEqual({ via: null, unconfirmed: null });
  });

  it("says it couldn't confirm when a relative import does not resolve", () => {
    const { pkg } = repo({
      "packages/app/vitest.config.ts": PACKAGE_CONFIG("../../vitest.shared"),
    });
    const out = configLines(pkg);
    expect(out).toContain("couldn't confirm that vitest.config.ts uses vitest-native");
    expect(out).toContain(
      "'../../vitest.shared' (imported by vitest.config.ts) could not be resolved",
    );
    expect(out).not.toContain("does not import vitest-native");
  });

  it("says it couldn't confirm past the depth it follows", () => {
    const { config } = repo({
      "d4.ts": USES,
      "d3.ts": `export { default } from "./d4";\n`,
      "d2.ts": `export { default } from "./d3";\n`,
      "d1.ts": `export { default } from "./d2";\n`,
      "packages/app/vitest.config.ts": PACKAGE_CONFIG("../../d1"),
    });
    expect(sharedConfigUse(config)).toEqual({
      via: null,
      unconfirmed: "it builds on modules more than 3 imports deep",
    });
  });

  it("still warns when every relative import was followed and none uses vitest-native", () => {
    const { pkg } = repo({
      "vitest.shared.ts": `export default { test: { globals: true } };\n`,
      "packages/app/vitest.config.ts": PACKAGE_CONFIG("../../vitest.shared"),
    });
    expect(configLines(pkg)).toContain(
      "⚠ vitest.config.ts exists but does not import vitest-native",
    );
  });
});
