import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { babelConfigFingerprint, fsModuleCacheKey } from "../src/fs-module-cache.js";
import {
  classifyProjectBabelEntry,
  configItemName,
  hasFlowPragma,
  isProjectSourceFile,
  projectBabelTrigger,
} from "../src/project-babel.js";

const ROOT = "/app";
const classify = (name: string, kind: "plugin" | "preset", options?: unknown) =>
  classifyProjectBabelEntry({ name, kind, options }, ROOT, []);
const trigger = (name: string, kind: "plugin" | "preset", options?: unknown) =>
  projectBabelTrigger({ name, kind, options }, ROOT, []);
/** Whether a needed entry applies to `source` (an entry with no test applies to all). */
const appliesTo = (name: string, kind: "plugin" | "preset", options: unknown, source: string) => {
  const c = classify(name, kind, options);
  return c.kind === "needed" && (c.applies === null || c.applies(source));
};

describe("classifyProjectBabelEntry: which entries matter (#579)", () => {
  it("covers the React Native and Expo presets with the options that change nothing", () => {
    expect(
      trigger("@react-native/babel-preset", "preset", {
        unstable_transformProfile: "hermes-stable",
        dev: true,
      }),
    ).toBeNull();
    expect(
      trigger("babel-preset-expo", "preset", {
        jsxRuntime: "automatic",
        lazyImports: true,
        "react-compiler": {},
      }),
    ).toBeNull();
    expect(
      trigger("@babel/preset-env", "preset", {
        include: ["x"],
        exclude: ["y"],
        modules: "commonjs",
      }),
    ).toBeNull();
    expect(trigger("@babel/preset-typescript", "preset")).toBeNull();
  });

  it("needs a preset option that changes the output, and an unknown preset everywhere", () => {
    expect(trigger("babel-preset-expo", "preset", { jsxImportSource: "nativewind" })).toBe(
      "babel-preset-expo's `jsxImportSource`",
    );
    expect(
      appliesTo("babel-preset-expo", "preset", { jsxImportSource: "nativewind" }, "<View />"),
    ).toBe(false);
    expect(
      appliesTo(
        "babel-preset-expo",
        "preset",
        { jsxImportSource: "nativewind" },
        '<View className="p-2" />',
      ),
    ).toBe(true);
    expect(trigger("@babel/preset-env", "preset", { loose: true })).toBe(
      "@babel/preset-env's `loose` option",
    );
    expect(appliesTo("some-preset", "preset", undefined, "anything")).toBe(true);
  });

  it("takes out the module transforms and coverage instrumentation", () => {
    expect(classify("@babel/plugin-transform-modules-commonjs", "plugin")).toEqual({
      kind: "strip",
    });
    expect(classify("babel-plugin-dynamic-import-node", "plugin")).toEqual({ kind: "strip" });
    expect(classify("babel-plugin-istanbul", "plugin")).toEqual({ kind: "strip" });
  });

  it("covers syntax Oxc compiles, and needs syntax it does not parse only where it appears", () => {
    expect(trigger("@babel/plugin-transform-export-namespace-from", "plugin")).toBeNull();
    expect(trigger("@babel/plugin-transform-class-properties", "plugin")).toBeNull();
    expect(appliesTo("@babel/plugin-proposal-pipeline-operator", "plugin", {}, "a |> f")).toBe(
      true,
    );
    expect(appliesTo("@babel/plugin-proposal-pipeline-operator", "plugin", {}, "a | b")).toBe(
      false,
    );
    expect(
      appliesTo("@babel/plugin-proposal-export-default-from", "plugin", {}, "export v from 'm';"),
    ).toBe(true);
  });

  it("needs semantic options only where they matter", () => {
    const loose = { loose: true };
    expect(
      appliesTo("@babel/plugin-transform-class-properties", "plugin", loose, "export class A {}"),
    ).toBe(true);
    expect(
      appliesTo(
        "@babel/plugin-transform-class-properties",
        "plugin",
        loose,
        "/** no class here */",
      ),
    ).toBe(false);
    expect(
      appliesTo("@babel/plugin-transform-react-jsx", "plugin", { pragma: "h" }, "<View />"),
    ).toBe(true);
    expect(
      appliesTo(
        "@babel/plugin-transform-flow-strip-types",
        "plugin",
        { all: true },
        "let a: number",
      ),
    ).toBe(true);
  });

  it("needs decorators where a line starts with one, not for a JSDoc tag", () => {
    const decorators = "@babel/plugin-proposal-decorators";
    expect(
      appliesTo(decorators, "plugin", { legacy: true }, "class A {\n  @field('x') x;\n}"),
    ).toBe(true);
    expect(appliesTo(decorators, "plugin", { legacy: true }, "/**\n * @param a\n */")).toBe(false);
  });

  it("needs macros, dotenv and unknown plugins where they apply", () => {
    expect(
      appliesTo("babel-plugin-macros", "plugin", undefined, "import t from 'ts-macro.macro'"),
    ).toBe(true);
    expect(appliesTo("babel-plugin-macros", "plugin", undefined, "import t from 'x'")).toBe(false);
    expect(
      appliesTo("module:react-native-dotenv", "plugin", undefined, "import { API } from '@env'"),
    ).toBe(true);
    expect(
      appliesTo("module:react-native-dotenv", "plugin", { moduleName: "@cfg" }, "from '@env'"),
    ).toBe(false);
    expect(appliesTo("./babel/custom.js", "plugin", undefined, "anything")).toBe(true);
    expect(trigger("babel-plugin-module-resolver", "plugin")).toBeNull();
  });
});

describe("configItemName", () => {
  it("names a config item as doctor does, from any way it was written", () => {
    expect(
      configItemName({ file: { request: "module:@react-native/babel-preset" } }, "preset"),
    ).toBe("@react-native/babel-preset");
    expect(
      configItemName(
        { file: { request: "/a/node_modules/@babel/plugin-proposal-decorators/lib/index.js" } },
        "plugin",
      ),
    ).toBe("@babel/plugin-proposal-decorators");
    expect(configItemName({ file: { request: "macros" } }, "plugin")).toBe("babel-plugin-macros");
    expect(configItemName({ file: { request: "./plugins/a.cjs" } }, "plugin")).toBe(
      "./plugins/a.cjs",
    );
    expect(configItemName({}, "plugin")).toBe("an inline plugin");
  });
});

describe("project source and Flow", () => {
  it("takes project source, not packages, queries or other extensions", () => {
    expect(isProjectSourceFile("/app/src/Model.js")).toBe(true);
    expect(isProjectSourceFile("/app/src/a.tsx")).toBe(true);
    expect(isProjectSourceFile("/app/node_modules/x/a.js")).toBe(false);
    expect(isProjectSourceFile("/app/src/a.js?raw")).toBe(false);
    expect(isProjectSourceFile("/app/src/a.json")).toBe(false);
  });

  it("reads a @flow pragma from the leading comments only", () => {
    expect(hasFlowPragma("// @flow\nconst a = 1;")).toBe(true);
    expect(hasFlowPragma("/**\n * @flow strict\n */\nexport {};")).toBe(true);
    expect(hasFlowPragma("const a = 1;\n/** @flow */")).toBe(false);
  });
});

describe("the transform-cache key includes the project's Babel config", () => {
  it("changes when babel.config.js changes, and only then", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-babel-key-"));
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    const own = path.resolve(import.meta.dirname, "..");
    const without = fsModuleCacheKey(own, root, {});
    fs.writeFileSync(path.join(root, "babel.config.js"), "module.exports = { plugins: [] };");
    const first = babelConfigFingerprint(root);
    const withConfig = fsModuleCacheKey(own, root, {});
    expect(withConfig).not.toBe(without);
    expect(fsModuleCacheKey(own, root, {})).toBe(withConfig);
    fs.writeFileSync(path.join(root, "babel.config.js"), "module.exports = { plugins: ['x'] };");
    expect(babelConfigFingerprint(root)).not.toBe(first);
    expect(fsModuleCacheKey(own, root, {})).not.toBe(withConfig);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
