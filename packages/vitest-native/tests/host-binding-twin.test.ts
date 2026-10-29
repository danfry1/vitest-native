import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// End to end: a project whose own `vitest` is one physical copy while vitest-native's
// resolves another, as a peer-variant install lays out two copies of one version. With
// the default config this must keep working, since Vitest's resolver maps vitest-native's
// setup import to the running copy; with the hot runtime, whose worker Node loads
// directly, it must stop by name instead of failing every file (src/host.ts).
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(PACKAGE_ROOT, "../..");
const EXAMPLE = path.join(REPO, "apps/example");
const STORE = path.join(REPO, "node_modules/.bun");

const copies = fs.existsSync(STORE)
  ? fs
      .readdirSync(STORE)
      .filter((name) => /^vitest@\d/.test(name))
      .map((name) => fs.realpathSync(path.join(STORE, name, "node_modules/vitest")))
  : [];
const built = fs.existsSync(path.join(PACKAGE_ROOT, "dist/index.mjs"));
const ready = built && copies.length >= 2 && fs.existsSync(EXAMPLE);
const temps: string[] = [];

afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

/** apps/example with `vitest` → copies[0] and vitest-native's own `vitest` → copies[1]. */
function twinProject(pluginOptions: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-twin-"));
  temps.push(root);
  for (const entry of ["__tests__", "src", "package.json"]) {
    fs.cpSync(path.join(EXAMPLE, entry), path.join(root, entry), { recursive: true });
  }
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { jsx: "react-jsx", strict: true, noEmit: true } }),
  );
  const config = fs
    .readFileSync(path.join(EXAMPLE, "vitest.config.ts"), "utf8")
    .replace("plugins: [reactNative()],", `plugins: [reactNative(${pluginOptions})],`);
  fs.writeFileSync(path.join(root, "vitest.config.ts"), config);
  const modules = path.join(root, "node_modules");
  fs.mkdirSync(modules);
  for (const entry of fs.readdirSync(path.join(EXAMPLE, "node_modules"))) {
    if (["vitest", "vitest-native", ".bin"].includes(entry)) continue;
    fs.symlinkSync(
      fs.realpathSync(path.join(EXAMPLE, "node_modules", entry)),
      path.join(modules, entry),
    );
  }
  fs.symlinkSync(copies[0], path.join(modules, "vitest"), "dir");
  // A real directory, so React and the other peers resolve from the project.
  const own = path.join(modules, "vitest-native");
  fs.mkdirSync(path.join(own, "node_modules"), { recursive: true });
  fs.cpSync(path.join(PACKAGE_ROOT, "dist"), path.join(own, "dist"), { recursive: true });
  fs.copyFileSync(path.join(PACKAGE_ROOT, "package.json"), path.join(own, "package.json"));
  for (const dep of ["flow-remove-types", "magic-string"]) {
    fs.symlinkSync(
      fs.realpathSync(path.join(PACKAGE_ROOT, "node_modules", dep)),
      path.join(own, "node_modules", dep),
    );
  }
  fs.symlinkSync(copies[1], path.join(own, "node_modules/vitest"), "dir");
  return root;
}

function run(root: string, args: string[] = []) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/vitest/vitest.mjs"), "run", ...args],
    { cwd: root, encoding: "utf8", env: { ...process.env, VITEST: undefined } },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe("two physical copies of Vitest", () => {
  it("can be built here", () => {
    expect(built, "run `bun run build` before this suite").toBe(true);
    expect(
      copies.length,
      "this repository's install holds two vitest copies",
    ).toBeGreaterThanOrEqual(2);
  });

  it.runIf(ready)(
    "run with the default config, through Vitest's resolver",
    () => {
      const { status, output } = run(twinProject(""));
      expect(output).not.toContain("VITEST_TWIN_INSTANCE");
      expect(output).toMatch(/Test Files {2}\d+ passed/);
      expect(status).toBe(0);
    },
    300_000,
  );

  it.runIf(ready)(
    "stop by name under the hot runtime, whose worker Node loads",
    () => {
      const { status, output } = run(twinProject("{ hotRuntime: true }"), ["--maxWorkers=2"]);
      expect(output).toContain("VITEST_TWIN_INSTANCE");
      expect(output).toContain("hot runtime's worker");
      expect(status).not.toBe(0);
    },
    300_000,
  );
});
