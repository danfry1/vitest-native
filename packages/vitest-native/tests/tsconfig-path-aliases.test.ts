import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { expandAlias } from "../src/jest-compat/aliases.mjs";
import { stripJsonc, tsconfigPathAliases } from "../src/native/tsconfig-paths.mjs";

// tsconfig `paths` resolve imports through Vite; a `require('#/…')` or
// `jest.requireActual('#/…')` resolves through Node and needs them as aliases.
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-tsconfig-aliases-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

describe("stripJsonc", () => {
  it("drops comments and trailing commas but never touches strings", () => {
    const text = `{
      // line
      "a": "http://x/*not a comment*/", /* block */
      "b": [1, 2,],
      "c": "keep , } this",
    }`;
    expect(JSON.parse(stripJsonc(text))).toEqual({
      a: "http://x/*not a comment*/",
      b: [1, 2],
      c: "keep , } this",
    });
  });
});

describe("tsconfigPathAliases", () => {
  it("maps wildcard and exact paths relative to the declaring tsconfig", () => {
    // Bluesky social-app's shape: comments, trailing commas, an extends to a package.
    const root = project({
      "tsconfig.json": `{
        "compilerOptions": {
          "paths": {
            "#/*": ["./src/*"],
            "crypto": ["./src/platform/crypto.ts"], // exact
          },
        },
      }`,
    });
    const { entries, skipped } = tsconfigPathAliases(root);
    expect(entries).toEqual([
      ["#/", `${path.join(root, "src")}/`],
      ["crypto", path.join(root, "src/platform/crypto.ts")],
    ]);
    expect(skipped).toEqual([]);
    expect(expandAlias("#/lib/appState", entries)).toBe(`${path.join(root, "src")}/lib/appState`);
  });

  it("resolves targets against baseUrl when set", () => {
    const root = project({
      "tsconfig.json": `{ "compilerOptions": { "baseUrl": "./app", "paths": { "@/*": ["*"] } } }`,
    });
    // `@/*` → `*` cannot be a prefix alias (the target has no directory part).
    expect(tsconfigPathAliases(root).skipped).toEqual(["@/*"]);
    const withDir = project({
      "tsconfig.json": `{ "compilerOptions": { "baseUrl": "./app", "paths": { "@/*": ["lib/*"] } } }`,
    });
    expect(tsconfigPathAliases(withDir).entries).toEqual([
      ["@/", `${path.join(withDir, "app/lib")}/`],
    ]);
  });

  it("inherits paths through extends, relative to the config that declares them", () => {
    const root = project({
      "config/base.json": `{ "compilerOptions": { "paths": { "~/*": ["../src/*"] } } }`,
      "tsconfig.json": `{ "extends": "./config/base.json" }`,
    });
    expect(tsconfigPathAliases(root).entries).toEqual([["~/", `${path.join(root, "src")}/`]]);
  });

  it("lets a child's paths replace its base's entirely, as TypeScript does", () => {
    const root = project({
      "base.json": `{ "compilerOptions": { "paths": { "~/*": ["./old/*"] } } }`,
      "tsconfig.json": `{ "extends": "./base.json", "compilerOptions": { "paths": { "#/*": ["./src/*"] } } }`,
    });
    expect(tsconfigPathAliases(root).entries).toEqual([["#/", `${path.join(root, "src")}/`]]);
  });

  it("resolves a leaf's paths against a baseUrl inherited from its base", () => {
    // A common monorepo layout: the root base sets baseUrl, the app sets paths.
    const root = project({
      "tsconfig.base.json": `{ "compilerOptions": { "baseUrl": "." } }`,
      "packages/app/tsconfig.json": `{
        "extends": "../../tsconfig.base.json",
        "compilerOptions": { "paths": { "#/*": ["packages/app/src/*"] } }
      }`,
    });
    expect(tsconfigPathAliases(path.join(root, "packages/app")).entries).toEqual([
      ["#/", `${path.join(root, "packages/app/src")}/`],
    ]);
  });

  it("sees a shared base through both sides of a diamond", () => {
    const root = project({
      "shared.json": `{ "compilerOptions": { "baseUrl": "./lib" } }`,
      "a.json": `{ "extends": "./shared.json" }`,
      "b.json": `{ "extends": "./shared.json", "compilerOptions": { "paths": { "@/*": ["x/*"] } } }`,
      "tsconfig.json": `{ "extends": ["./a.json", "./b.json"] }`,
    });
    expect(tsconfigPathAliases(root).entries).toEqual([["@/", `${path.join(root, "lib/x")}/`]]);
  });

  it("expands ${configDir} to the directory of the tsconfig in use", () => {
    const root = project({
      "config/base.json": `{ "compilerOptions": { "paths": { "~/*": ["\${configDir}/src/*"] } } }`,
      "app/tsconfig.json": `{ "extends": "../config/base.json" }`,
    });
    expect(tsconfigPathAliases(path.join(root, "app")).entries).toEqual([
      ["~/", `${path.join(root, "app/src")}/`],
    ]);
  });

  it("reports patterns a prefix alias cannot express instead of guessing", () => {
    const root = project({
      "tsconfig.json": `{ "compilerOptions": { "paths": { "*-icons": ["./icons/*"], "a/*/b": ["./x/*/b"] } } }`,
    });
    expect(tsconfigPathAliases(root)).toEqual({ entries: [], skipped: ["*-icons", "a/*/b"] });
  });

  it("returns nothing without a tsconfig, or with an unreadable one", () => {
    expect(tsconfigPathAliases(project({}))).toEqual({ entries: [], skipped: [] });
    expect(tsconfigPathAliases(project({ "tsconfig.json": "{ nope" }))).toEqual({
      entries: [],
      skipped: [],
    });
  });
});

describe("the plugin hands tsconfig paths to Node-side resolution", () => {
  const configFor = async (root: string, resolve: Record<string, unknown>) => {
    const { reactNative } = await import("../src/index.js");
    const { runPluginConfig } = await import("./plugin-config.js");
    const result = await runPluginConfig(reactNative({ engine: "mock" }) as never, {
      root,
      resolve,
    });
    return JSON.parse(result?.test?.env?.VITEST_NATIVE_REQUIRE_ALIASES ?? "[]");
  };

  it("when Vite resolves them for imports", async () => {
    const root = project({
      "package.json": "{}",
      "tsconfig.json": `{ "compilerOptions": { "paths": { "#/*": ["./src/*"] } } }`,
    });
    expect(await configFor(root, { tsconfigPaths: true })).toEqual([
      ["#/", `${path.join(root, "src")}/`],
    ]);
  });

  it("not when imports would not resolve them either", async () => {
    const root = project({
      "package.json": "{}",
      "tsconfig.json": `{ "compilerOptions": { "paths": { "#/*": ["./src/*"] } } }`,
    });
    expect(await configFor(root, {})).toEqual([]);
  });
});
