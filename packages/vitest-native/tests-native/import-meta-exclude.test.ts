/**
 * The fix IMPORT_META_IN_NODE_OWNED names for a package: `transform: { exclude: [pkg] }`
 * hands the package to Vite, where `import.meta.env` has its value. Run on the museum's
 * own-alias-import-meta shape (a React Native workspace library string-aliased to its
 * source), materialised against this build, once without the option and once with it.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { materialise, museumRoot, packageRoot } from "../validation/bug-museum/lib/materialise.mjs";

const exhibit = JSON.parse(
  fs.readFileSync(path.join(museumRoot, "exhibits.json"), "utf8"),
).exhibits.find((e: { id: string }) => e.id === "own-alias-import-meta");

const works: string[] = [];
afterAll(() => {
  for (const work of works) fs.rmSync(work, { recursive: true, force: true });
});

const USES_ENV = [
  {
    file: "packages/feature/src/meta.ts",
    find: "export const metaUrlType: string = typeof import.meta.url;",
    replace: "export const metaUrlType: string = import.meta.env.MODE;",
  },
  { file: "meta.test.ts", find: 'toBe("string")', replace: 'toBe("test")' },
];
const EXCLUDE = {
  file: "vitest.config.mts",
  find: "reactNative({ hotRuntime: false })",
  replace: 'reactNative({ hotRuntime: false, transform: { exclude: ["@m/feature"] } })',
};

function run(edits: object[]): { status: number | null; output: string } {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vn-import-meta-exclude-"));
  works.push(work);
  const root = materialise(exhibit, { work, build: packageRoot, edits });
  const vitest = path.join(fs.realpathSync(path.join(root, "node_modules/vitest")), "vitest.mjs");
  // The child is its own Vitest run, not a worker of this one.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")),
  );
  const proc = spawnSync(process.execPath, [vitest, "run"], {
    cwd: root,
    env: { ...env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: proc.status, output: `${proc.stdout}\n${proc.stderr}` };
}

it("without it, Node loads the library and `import.meta.env` fails by name", () => {
  const { status, output } = run(USES_ENV);
  expect(status, output).not.toBe(0);
  expect(output).toMatch(/`import\.meta\.env` in \S*packages\/feature\/src\/meta\.ts:\d+:\d+/);
  expect(output).toContain("let Vite load '@m/feature'");
}, 150_000);

it("with `transform: { exclude: [pkg] }`, Vite loads it and `import.meta.env` works", () => {
  const { status, output } = run([...USES_ENV, EXCLUDE]);
  expect(status, output).toBe(0);
}, 150_000);
