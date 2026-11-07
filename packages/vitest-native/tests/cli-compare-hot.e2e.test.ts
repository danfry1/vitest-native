/**
 * `vitest-native compare --hot` end to end: the CLI's main() runs Vitest for real on a small
 * project whose config uses reactNative() (mock engine), once per file and once hot, and the
 * banner check proves each run ran in the mode it claims. The wrapper's hook must reach the
 * plugin through the user's config (mergeConfig keeps plugin objects). Needs dist built.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli, scratchProject } from "./support/compare-helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distExists = fs.existsSync(path.join(packageRoot, "dist", "index.mjs"));

const fromPackage = (name: string) =>
  path.dirname(
    createRequire(path.join(packageRoot, "package.json")).resolve(`${name}/package.json`),
  );

function hotProject(engine: "native" | "mock", files: Record<string, string> = {}): string {
  const root = scratchProject({
    files: {
      "vitest.config.mjs": `import { reactNative } from "vitest-native";
export default { plugins: [reactNative({ engine: "${engine}" })], test: { include: ["src/**/*.test.js"] } };
`,
      "src/a.test.js": `import { test, expect } from "vitest";\ntest("a", () => expect(1).toBe(1));\n`,
      "src/b.test.js": `import { test, expect } from "vitest";\ntest("b", () => expect(2).toBe(2));\n`,
      "src/c.test.js": `import { test, expect } from "vitest";\ntest.each([1, 2])("row", (n) => expect(n).toBeGreaterThan(0));\n`,
      ...files,
    },
  });
  const modules = path.join(root, "node_modules");
  fs.symlinkSync(packageRoot, path.join(modules, "vitest-native"), "junction");
  // The native engine's dependencies, from this package's own install.
  for (const name of ["react", "react-native", "@babel/core", "@react-native/babel-preset"]) {
    const target = path.join(modules, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(fromPackage(name), target, "junction");
  }
  return root;
}

describe.runIf(distExists)("compare --hot: end to end", () => {
  it("runs both modes for real, proves each from its banner, and finds no difference", async () => {
    const root = hotProject("native");
    const out = path.join(root, "..", `${path.basename(root)}-hot.json`);
    const { code, text } = await runCli([
      "--hot",
      "--root",
      root,
      "--runs",
      "1",
      "--seed",
      "7",
      "--json",
      out,
    ]);
    expect(text).toContain("per-file 1");
    expect(text).toContain("hot 1");
    expect(text).toContain("hot shuffled (seed 7)");
    expect(text).toContain("hot at --maxWorkers=2");
    expect(text).toContain(
      "No difference in 1 per-file and 3 hot runs (shuffle seed 7): 4 tests compared.",
    );
    expect(code).toBe(0);
    const report = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(report.runs.map((r: { mode: string }) => r.mode)).toEqual([
      "per-file",
      "hot",
      "hot",
      "hot",
    ]);
    expect(report.versions.vitest).toBeTruthy();
  }, 180_000);

  it("gives no verdict where the config cannot run hot (the mock engine)", async () => {
    const root = hotProject("mock");
    const { code, text } = await runCli(["--hot", "--root", root, "--runs", "1", "--no-shuffle"]);
    expect(code).toBe(2);
    expect(text).toContain("the hot runtime runs only under the native engine");
  }, 180_000);
});
