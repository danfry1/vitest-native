/**
 * The ownership guard against real projects in child processes (docs/ownership-guard.md).
 *
 * Its role is a backstop: when the engine keeps one instance of a file, the guard must say
 * nothing; when a file still gets two live copies, it must name the file, both module
 * systems, the policy owner, the route and the fix.
 *
 * - One instance, no report. Shapes that split in October 2026 and give one instance on
 *   main since the engine hands Node Vite's instance of a file Vite evaluated first:
 *   - `alias`: a workspace package Node owns (it declares React Native) is aliased to its
 *     source, and that source imports a sibling the test imported first;
 *   - the same without a per-package alias: tsconfig paths, an alias above every
 *     package, a root alias, and a package whose `main` is its source;
 *   - `partial-mock`: a Jest partial mock of project source, mocked module imported first.
 * - Two instances, reported. `require-first` (the bug museum's own-require-first): the
 *   alias shape with the test's imports swapped, so Node evaluates the store before Vite.
 *   `warn` keeps the run going and reports once; `error` fails the file by name with
 *   SOURCE_EVALUATED_TWICE.
 * - Not this guard's to see. `dual-export` (the museum's own-dual-export-file): a package
 *   whose `import` and `require` conditions name different files. Both copies are Node's
 *   and they are different files, so no file is evaluated by both systems.
 *
 * The workspace is reached through a symlink, as a real path mismatch is exactly how a
 * ledger keyed by spelling would miss these (path-spelling keys).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");
const distExists = fs.existsSync(path.join(packageRoot, "dist", "index.mjs"));

function write(root: string, rel: string, value: unknown) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

// Junctions on Windows: directory symlinks need a privilege CI runners may not have.
const DIR = process.platform === "win32" ? "junction" : "dir";
let base = "";
let real = "";
let linked = "";

beforeAll(() => {
  if (!distExists) return;
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-ownership-guard-")));
  real = path.join(base, "real");
  linked = path.join(base, "linked");
  fs.mkdirSync(real);
  fs.symlinkSync(real, linked, DIR);

  write(real, "package.json", { name: "og-root", private: true, workspaces: ["packages/*"] });
  // A React Native workspace library, so detection makes it Node's.
  write(real, "packages/feature/package.json", {
    name: "@og/feature",
    version: "1.0.0",
    main: "lib/index.js",
    peerDependencies: { "react-native": "*" },
  });
  write(
    real,
    "packages/feature/src/index.ts",
    `import { store } from "@og/validator/store";
export const readStore = (): string | null => store.value;
`,
  );
  write(real, "packages/feature/lib/index.js", "exports.readStore = () => 'built copy';\n");
  // The same import by relative path, for aliases above the package (parent, root).
  write(
    real,
    "packages/feature/src/rel.ts",
    `import { store } from "../../validator/src/store";
export const readStore = (): string | null => store.value;
`,
  );
  // A just-in-time internal package: `main` is its TypeScript source, no alias at all.
  write(real, "packages/jit/package.json", {
    name: "@og/jit",
    version: "1.0.0",
    main: "src/index.ts",
    peerDependencies: { "react-native": "*" },
  });
  write(
    real,
    "packages/jit/src/index.ts",
    `import { store } from "@og/state";
export const readStore = (): string | null => store.value;
`,
  );
  write(real, "packages/state/package.json", {
    name: "@og/state",
    version: "1.0.0",
    main: "src/store.ts",
  });
  write(
    real,
    "packages/state/src/store.ts",
    "export const store: { value: string | null } = { value: null };\n",
  );
  write(real, "packages/validator/package.json", {
    name: "@og/validator",
    version: "1.0.0",
    main: "lib/index.js",
  });
  write(
    real,
    "packages/validator/src/store.ts",
    "export const store: { value: string | null } = { value: null };\n",
  );

  const modules = path.join(real, "node_modules");
  fs.mkdirSync(modules);
  for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
    if (name.startsWith(".")) continue;
    fs.symlinkSync(path.join(packageRoot, "node_modules", name), path.join(modules, name), DIR);
  }
  fs.symlinkSync(packageRoot, path.join(modules, "vitest-native"), DIR);
  fs.mkdirSync(path.join(modules, "@og"));
  fs.symlinkSync(path.join(real, "packages/feature"), path.join(modules, "@og/feature"), DIR);
  fs.symlinkSync(path.join(real, "packages/validator"), path.join(modules, "@og/validator"), DIR);
  fs.symlinkSync(path.join(real, "packages/jit"), path.join(modules, "@og/jit"), DIR);
  fs.symlinkSync(path.join(real, "packages/state"), path.join(modules, "@og/state"), DIR);

  write(real, "packages/app/package.json", {
    name: "@og/app",
    private: true,
    type: "module",
    dependencies: {
      "@og/feature": "*",
      "@og/validator": "*",
      "@og/jit": "*",
      "@og/state": "*",
      "react-native": "*",
    },
  });

  // Shape 1: both siblings aliased to source.
  write(
    real,
    "packages/app/alias/vitest.config.mts",
    `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
const ws = ${JSON.stringify(linked)};
export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false })],
  resolve: {
    alias: {
      "@og/feature": ws + "/packages/feature/src",
      "@og/validator": ws + "/packages/validator/src",
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
`,
  );
  write(
    real,
    "packages/app/alias/src/store.test.ts",
    `import { expect, it } from "vitest";
import { store } from "@og/validator/store";
import { readStore } from "@og/feature";
it("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
`,
  );

  // The same split reached without a per-package string alias (an adversarial review of
  // the alias-prefix fix, 2026-10): tsconfig paths, an alias above every package, a root
  // alias, and a package whose `main` is source. Matching alias text cannot see these;
  // the ledger sees the evaluations whatever produced them.
  const STORE_VIA = (validator: string, feature: string) => `import { expect, it } from "vitest";
import { store } from "${validator}";
import { readStore } from "${feature}";
it("one instance", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
`;
  const plainConfig = (resolve: string) => `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
const ws = ${JSON.stringify(linked)};
export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false })],
  resolve: ${resolve},
  test: { include: ["src/**/*.test.ts"] },
});
`;
  write(
    real,
    "packages/app/tsconfig-paths/vitest.config.mts",
    plainConfig("{ tsconfigPaths: true }"),
  );
  write(real, "packages/app/tsconfig-paths/tsconfig.json", {
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "@og/feature": ["../../feature/src/index.ts"],
        "@og/validator/*": ["../../validator/src/*"],
      },
    },
  });
  write(
    real,
    "packages/app/tsconfig-paths/src/store.test.ts",
    STORE_VIA("@og/validator/store", "@og/feature"),
  );
  write(
    real,
    "packages/app/parent-alias/vitest.config.mts",
    plainConfig(`{ alias: { "@pk": ws + "/packages" } }`),
  );
  write(
    real,
    "packages/app/parent-alias/src/store.test.ts",
    STORE_VIA("@pk/validator/src/store", "@pk/feature/src/rel"),
  );
  write(real, "packages/app/root-alias/vitest.config.mts", plainConfig(`{ alias: { "~": ws } }`));
  write(
    real,
    "packages/app/root-alias/src/store.test.ts",
    STORE_VIA("~/packages/validator/src/store", "~/packages/feature/src/rel"),
  );
  write(real, "packages/app/jit/vitest.config.mts", plainConfig("{}"));
  write(real, "packages/app/jit/src/store.test.ts", STORE_VIA("@og/state", "@og/jit"));

  // The alias shape with the imports swapped: Node-owned code loads the store first.
  write(
    real,
    "packages/app/require-first/vitest.config.mts",
    `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
const ws = ${JSON.stringify(linked)};
export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false })],
  resolve: {
    alias: {
      "@og/feature": ws + "/packages/feature/src",
      "@og/validator": ws + "/packages/validator/src",
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
`,
  );
  write(
    real,
    "packages/app/require-first/src/store.test.ts",
    `import { expect, it } from "vitest";
import { readStore } from "@og/feature";
import { store } from "@og/validator/store";
it("a store a Node-owned library loaded first is the store the test imports", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
`,
  );

  // A package with separate import and require builds, required by its own CommonJS.
  write(real, "node_modules/og-dual/package.json", {
    name: "og-dual",
    version: "1.0.0",
    type: "module",
    exports: { ".": { import: "./esm.mjs", require: "./cjs.cjs" }, "./reader": "./reader.cjs" },
  });
  write(real, "node_modules/og-dual/esm.mjs", "export const store = { value: null };\n");
  write(real, "node_modules/og-dual/cjs.cjs", "exports.store = { value: null };\n");
  write(
    real,
    "node_modules/og-dual/reader.cjs",
    'module.exports = () => require("og-dual").store;\n',
  );
  write(real, "packages/app/dual-export/vitest.config.mts", plainConfig("{}"));
  write(
    real,
    "packages/app/dual-export/src/store.test.ts",
    `import { expect, it } from "vitest";
import { store } from "og-dual";
import reader from "og-dual/reader";
it("one og-dual", () => {
  store.value = "configured";
  expect(reader().value).toBe("configured");
});
`,
  );

  // Shape 2: a Jest partial mock of project source, mocked module imported first.
  write(
    real,
    "packages/app/partial-mock/vitest.config.mts",
    `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestMockTransform } from "vitest-native/jest-compat";
export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false }), jestMockTransform()],
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["vitest-native/jest-compat/setup"],
  },
});
`,
  );
  write(
    real,
    "packages/app/partial-mock/src/store.ts",
    "export const store: { value: string | null } = { value: null };\n",
  );
  write(
    real,
    "packages/app/partial-mock/src/api.ts",
    `import { store } from "./store";
export const read = (): string | null => store.value;
export const other = (): string => "real";
`,
  );
  write(
    real,
    "packages/app/partial-mock/src/partial.test.ts",
    `import { expect, it } from "vitest";
import { other, read } from "./api";
import { store } from "./store";
declare const jest: any;
jest.mock("./api", () => ({ ...jest.requireActual("./api"), other: jest.fn(() => "mocked") }));
it("the partial mock reads the store the test writes", () => {
  store.value = "set-by-the-test";
  expect(other()).toBe("mocked");
  expect(read()).toBe("set-by-the-test");
});
`,
  );
}, 60_000);

afterAll(() => {
  if (base) fs.rmSync(base, { recursive: true, force: true });
});

function run(variant: string, mode: "warn" | "error") {
  const vitestBin = path.join(
    path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
    "vitest.mjs",
  );
  // This suite runs inside Vitest; none of its worker state may reach the child.
  const env: Record<string, string | undefined> = { ...process.env, CI: "1" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST") || key === "NODE_OPTIONS" || key === "NODE_PATH") delete env[key];
  }
  env.VITEST_NATIVE_OWNERSHIP_MODE = mode;
  // `verbose`: the default reporter, writing to a pipe, drops console output.
  const child = spawnSync(process.execPath, [vitestBin, "run", "--reporter=verbose"], {
    cwd: path.join(linked, "packages/app", variant),
    encoding: "utf8",
    env,
    timeout: 180_000,
  });
  return { status: child.status, output: `${child.stdout}\n${child.stderr}` };
}

/** The guard's report for `file`, from either a warning or the thrown error. */
function reportFor(output: string, file: string) {
  const at = output.indexOf(`${file} was evaluated by both Node and Vite`);
  return at === -1 ? "" : output.slice(at, at + 4000);
}

describe("the ownership guard reports a real dual evaluation", () => {
  it("needs dist", () => {
    expect(distExists, "run `bun run build` before this suite — CI builds first").toBe(true);
  });

  const store = () => path.join(real, "packages/validator/src/store.ts");
  const REPORTED = /was evaluated by both Node and Vite/;

  it.runIf(distExists).each(["alias", "tsconfig-paths", "parent-alias", "root-alias", "jit"])(
    "%s, error: one instance, so the guard reports nothing and the test passes",
    (variant) => {
      const { status, output } = run(variant, "error");
      expect(output).not.toMatch(REPORTED);
      expect(output).not.toContain("SOURCE_EVALUATED_TWICE");
      expect(status, output).toBe(0);
    },
    200_000,
  );

  it.runIf(distExists)(
    "partial-mock, error: one instance through jest.requireActual, nothing reported",
    () => {
      const { status, output } = run("partial-mock", "error");
      expect(output).not.toMatch(REPORTED);
      expect(status, output).toBe(0);
    },
    200_000,
  );

  it.runIf(distExists)(
    "require-first, warn: reported once, naming both sides, while the split still fails the test",
    () => {
      const { status, output } = run("require-first", "warn");
      const report = reportFor(output, store());
      expect(report, output).not.toBe("");
      expect(output.split(`${store()} was evaluated by both`)).toHaveLength(2);
      // The sibling is neither the package under test nor detected: the policy leaves
      // it to Vitest, and the report says so rather than inventing an owner.
      expect(report).toContain("policy owner -> none declared (delegated)");
      expect(report).toContain(
        `first        -> Node (CommonJS), required by ${path.join(real, "packages/feature/src/index.ts")}`,
      );
      expect(report).toMatch(/second\s+-> Vite, imported by .*store\.test\.ts/);
      expect(report).toContain("route        -> an import from source Node evaluated");
      expect(report).toContain("fix          -> Node-owned code reached a file Vite owns");
      expect(output).toContain("expected null to be 'written by the test'");
      expect(status).not.toBe(0);
    },
    200_000,
  );

  it.runIf(distExists)(
    "require-first, error: the file fails by name with SOURCE_EVALUATED_TWICE",
    () => {
      const { status, output } = run("require-first", "error");
      const report = reportFor(output, store());
      expect(report, output).not.toBe("");
      expect(output).toContain("SOURCE_EVALUATED_TWICE");
      // The import of the second copy throws, so the file fails while collecting.
      expect(report).toContain("Vite's copy ran; this file fails.");
      expect(output).not.toContain("expected null to be 'written by the test'");
      expect(status).not.toBe(0);
    },
    200_000,
  );

  it.runIf(distExists)(
    "dual-export: two different files, both Node's, so the split is outside the guard",
    () => {
      const { status, output } = run("dual-export", "error");
      // The split is real...
      expect(output).toContain("expected null to be 'configured'");
      // ...and the guard, which compares one file across the two module systems, has
      // nothing to report. A change that makes it report here is a new check, not this one.
      expect(output).not.toMatch(REPORTED);
      expect(status).not.toBe(0);
    },
    200_000,
  );
});
