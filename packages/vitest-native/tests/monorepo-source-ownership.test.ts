/**
 * A workspace package that `resolve.alias` points at its SOURCE is Vite's to own.
 *
 * Detection claims any workspace sibling declaring React Native, and its directory
 * becomes a `server.deps.external` pattern. An alias such as
 * `'@fx/feature': '<ws>/packages/feature/src'` sends Vite's resolution of that package
 * into the same directory, so every aliased file was resolved by Vite and then handed to
 * Node to load. What followed depended on the alias:
 *
 * - string aliases: no error at all, and TWO copies of a sibling's store — a value the
 *   test wrote through Vite read back unset through Node's copy;
 * - regex aliases: "Cannot find module", because Node's alias fallback understands only
 *   string-to-string entries;
 * - `import.meta` in the aliased source: a SyntaxError, from Node compiling it to CJS.
 *
 * Each case below is a real run in a child process, because what is under test is which
 * module system loads a file — not what detection returns. A store written through one
 * import path and read through the other is the observable form of "one instance".
 *
 * The aliases are written through a symlink to the workspace. Node keys packages by
 * real path, and an alias as written is not one (macOS's `/var` → `/private/var` is the
 * everyday form; Windows' drive spellings another), so a comparison of spellings would
 * miss it. See path-spelling-keys in the project notes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sourceAliasTargets } from "../src/native/ecosystem.js";

const packageRoot = path.resolve(import.meta.dirname, "..");
const distExists = fs.existsSync(path.join(packageRoot, "dist", "index.mjs"));

function write(root: string, rel: string, value: unknown) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

let real = "";
/** The workspace as the configs spell it: through a symlink, never its real path. */
let linked = "";

const STORE_TEST = (feature: string) => `import { expect, it } from "vitest";
import { store } from "@fx/validator/store";
import { readStore } from "${feature}";
it("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
`;

function config(alias: string, extra = "") {
  return `import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
const ws = ${JSON.stringify(linked)};
export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false })],
  resolve: { alias: ${alias} },
  test: { include: ["src/**/*.test.ts"]${extra} },
});
`;
}

beforeAll(() => {
  if (!distExists) return;
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-source-alias-")));
  real = path.join(base, "real");
  linked = path.join(base, "linked");
  fs.mkdirSync(real);
  fs.symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir");

  write(real, "package.json", {
    name: "fx-root",
    private: true,
    workspaces: ["apps/*", "packages/*"],
  });
  // A React Native workspace library. `main` names a build that exists, so a Node
  // require of the package by name succeeds — the shape the warning case needs.
  write(real, "packages/feature/package.json", {
    name: "@fx/feature",
    version: "1.0.0",
    main: "lib/index.js",
    peerDependencies: { "react-native": "*" },
  });
  write(
    real,
    "packages/feature/src/index.ts",
    `import { store } from "@fx/validator/store";
export const readStore = (): string | null => store.value;
`,
  );
  // import.meta is a compile error once Node's loader turns this into CommonJS.
  write(
    real,
    "packages/feature/src/meta.ts",
    "export const metaUrlType: string = typeof import.meta.url;\n",
  );
  write(real, "packages/feature/lib/index.js", "exports.readStore = () => 'built copy';\n");
  write(real, "packages/validator/package.json", {
    name: "@fx/validator",
    version: "1.0.0",
    main: "lib/index.js",
  });
  write(
    real,
    "packages/validator/src/store.ts",
    "export const store: { value: string | null } = { value: null };\n",
  );

  // An installed React Native package that requires the aliased library by name.
  write(real, "node_modules/rn-requires-feature/package.json", {
    name: "rn-requires-feature",
    version: "1.0.0",
    main: "index.js",
    dependencies: { "@fx/feature": "*" },
    peerDependencies: { "react-native": "*" },
  });
  write(
    real,
    "node_modules/rn-requires-feature/index.js",
    "exports.viaNode = () => require('@fx/feature').readStore();\n",
  );

  const modules = path.join(real, "node_modules");
  for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
    if (name.startsWith(".") || fs.existsSync(path.join(modules, name))) continue;
    fs.symlinkSync(path.join(packageRoot, "node_modules", name), path.join(modules, name));
  }
  fs.symlinkSync(packageRoot, path.join(modules, "vitest-native"));
  fs.mkdirSync(path.join(modules, "@fx"));
  fs.symlinkSync(path.join(real, "packages/feature"), path.join(modules, "@fx/feature"));
  fs.symlinkSync(path.join(real, "packages/validator"), path.join(modules, "@fx/validator"));

  const app = path.join(real, "apps/mobile");
  write(app, "package.json", {
    name: "@fx/mobile",
    private: true,
    type: "module",
    dependencies: {
      "@fx/feature": "*",
      "@fx/validator": "*",
      "rn-requires-feature": "*",
      react: "*",
      "react-native": "*",
    },
  });

  // String aliases, keyed by package name — the reported configuration.
  write(
    app,
    "string/vitest.config.mts",
    config(`{
    "@fx/feature": ws + "/packages/feature/src",
    "@fx/validator": ws + "/packages/validator/src",
  }`),
  );
  write(app, "string/src/store.test.ts", STORE_TEST("@fx/feature"));
  write(
    app,
    "string/src/meta.test.ts",
    `import { expect, it } from "vitest";
import { metaUrlType } from "@fx/feature/meta";
it("aliased source using import.meta loads", () => expect(metaUrlType).toBe("string"));
`,
  );

  // Regex aliases: only the replacement's static prefix names a directory.
  write(
    app,
    "regex/vitest.config.mts",
    config(`[
    { find: /^@fx\\/feature\\/(.*)$/, replacement: ws + "/packages/feature/src/$1" },
    { find: /^@fx\\/validator\\/(.*)$/, replacement: ws + "/packages/validator/src/$1" },
  ]`),
  );
  write(app, "regex/src/store.test.ts", STORE_TEST("@fx/feature/index"));

  // An alias whose name is not the package's: ownership has to follow the directory.
  write(
    app,
    "renamed/vitest.config.mts",
    config(`{
    "@feat": ws + "/packages/feature/src",
    "@fx/validator": ws + "/packages/validator/src",
  }`),
  );
  write(app, "renamed/src/store.test.ts", STORE_TEST("@feat"));

  // An installed, Node-owned package requiring the Vite-owned library by name gets
  // Node's own copy. Nothing can make that one instance; it must not be silent.
  write(
    app,
    "required/vitest.config.mts",
    config(`{
    "@fx/feature": ws + "/packages/feature/src",
    "@fx/validator": ws + "/packages/validator/src",
  }`),
  );
  write(
    app,
    "required/src/required.test.ts",
    `import { expect, it } from "vitest";
import { viaNode } from "rn-requires-feature";
it("Node's require reaches the built copy", () => expect(viaNode()).toBe("built copy"));
`,
  );
}, 60_000);

afterAll(() => {
  if (real) fs.rmSync(path.dirname(real), { recursive: true, force: true });
});

function run(variant: string) {
  const vitestBin = path.join(
    path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
    "vitest.mjs",
  );
  // This suite runs inside Vitest; none of its worker state may reach the child.
  const env: Record<string, string | undefined> = { ...process.env, CI: "1" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST") || key === "NODE_OPTIONS" || key === "NODE_PATH") delete env[key];
  }
  // cwd through the symlink as well, so the run root is spelled the same way.
  const cwd = path.join(linked, "apps/mobile", variant);
  // `verbose` because the default reporter, writing to a pipe, drops the console
  // output of passing tests — and the warning case asserts on exactly that.
  const child = spawnSync(process.execPath, [vitestBin, "run", "--reporter=verbose"], {
    cwd,
    encoding: "utf8",
    env,
    timeout: 180_000,
  });
  return { status: child.status, output: `${child.stdout}\n${child.stderr}` };
}

describe("workspace packages aliased to source are owned by Vite", () => {
  it("needs dist", () => {
    expect(distExists, "run `bun run build` before this suite — CI builds first").toBe(true);
  });

  it.runIf(distExists)(
    "string aliases keep one instance, and aliased source may use import.meta",
    () => {
      const { status, output } = run("string");
      expect(status, output).toBe(0);
      expect(output).toMatch(/Tests\s+2 passed/);
    },
    200_000,
  );

  it.runIf(distExists)(
    "regex aliases resolve through Vite rather than failing in Node",
    () => {
      const { status, output } = run("regex");
      expect(output).not.toContain("Cannot find module");
      expect(status, output).toBe(0);
    },
    200_000,
  );

  it.runIf(distExists)(
    "an alias named differently from the package is matched by its directory",
    () => {
      const { status, output } = run("renamed");
      expect(status, output).toBe(0);
    },
    200_000,
  );

  it.runIf(distExists)(
    "a Node-owned package requiring the aliased library by name is reported",
    () => {
      const { status, output } = run("required");
      expect(status, output).toBe(0);
      expect(output).toContain("Node resolved a file Vite owns");
      expect(output).toContain(path.join(real, "packages/feature/lib/index.js"));
      expect(output).toContain(path.join("rn-requires-feature", "index.js"));
    },
    200_000,
  );
});

describe("sourceAliasTargets", () => {
  it("reads both shapes, cuts regex templates at the first $, and real-paths them", () => {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-alias-targets-")));
    try {
      fs.mkdirSync(path.join(base, "real/src"), { recursive: true });
      fs.symlinkSync(
        path.join(base, "real"),
        path.join(base, "link"),
        process.platform === "win32" ? "junction" : "dir",
      );
      const via = (rel: string) => path.join(base, "link", rel);
      expect(sourceAliasTargets({ "@a": via("src") })).toEqual([path.join(base, "real/src")]);
      expect(sourceAliasTargets([{ find: /^@a\/(.*)$/, replacement: `${via("src")}/$1` }])).toEqual(
        [path.join(base, "real/src")],
      );
      // A path that does not exist keeps its tail beneath the real ancestor.
      expect(sourceAliasTargets({ "@b": via("not-yet/x") })).toEqual([
        path.join(base, "real/not-yet/x"),
      ]);
      // Not first-party directories, or not this option's decision.
      expect(
        sourceAliasTargets([
          { find: "@rel", replacement: "./src" },
          { find: "@nm", replacement: path.join(base, "node_modules/pkg/src") },
          { find: "@custom", replacement: via("src"), customResolver: () => null },
          { find: "@all", replacement: "$1" },
          null,
        ]),
      ).toEqual([]);
      expect(sourceAliasTargets(undefined)).toEqual([]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
