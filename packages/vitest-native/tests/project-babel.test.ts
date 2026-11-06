import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { babelConfigFingerprint, fsModuleCacheKey } from "../src/fs-module-cache.js";
import {
  classifyProjectBabelEntry,
  configItemName,
  normalizePluginKey,
  pluginNameOfKey,
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
    // NativeWind compiles every JSX element, with or without className.
    expect(
      appliesTo("babel-preset-expo", "preset", { jsxImportSource: "nativewind" }, "<View />"),
    ).toBe(true);
    expect(
      appliesTo("babel-preset-expo", "preset", { jsxImportSource: "nativewind" }, "const a = 1;"),
    ).toBe(false);
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

  it("needs decorators where a line starts with one", () => {
    const decorators = "@babel/plugin-proposal-decorators";
    expect(
      appliesTo(decorators, "plugin", { legacy: true }, "class A {\n  @field('x') x;\n}"),
    ).toBe(true);
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
    expect(
      configItemName(
        { file: { request: "/a/node_modules/react-native-worklets/plugin/index.js" } },
        "plugin",
      ),
    ).toBe("react-native-worklets/plugin");
    expect(
      configItemName({ file: { request: "/a/node_modules/babel-plugin-x/index.js" } }, "plugin"),
    ).toBe("babel-plugin-x");
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

describe("source tests: the misses review found (#597)", () => {
  const decorators = (source: string) =>
    appliesTo("@babel/plugin-proposal-decorators", "plugin", { legacy: true }, source);
  it("finds decorators anywhere an expression can start", () => {
    expect(decorators("export default @observer class Store {}")).toBe(true);
    expect(decorators("class A {\n  @ field() name;\n}")).toBe(true);
    expect(decorators("class A { @field('x') a; @field('y') b; }")).toBe(true);
  });
  it("does not take an e-mail address, a path or a string for a decorator", () => {
    expect(decorators("const mail = 'a@b.com';")).toBe(false);
    expect(decorators("import { API } from '@env';")).toBe(false);
    expect(decorators("fetch('https://x.io/@user')")).toBe(false);
  });
  it("reads comments too: a tag in one only routes the file (an accepted over-match)", () => {
    expect(decorators("/**\n * @param a\n */\nexport const f = (a) => a;")).toBe(true);
    expect(decorators("const a = 1; /* end */\n<Text>Don't</Text>;\n@observer class A {}")).toBe(
      true,
    );
  });
  it("does not let a string that looks like a comment hide a decorator", () => {
    expect(
      decorators("const glob = './assets/*';\nclass A {\n  @field('x') x;\n}\nconst end = '*/';"),
    ).toBe(true);
    expect(decorators("const s = '// not a comment';\n@observer class A {}")).toBe(true);
  });
  it("finds generic and implementing classes, not the word in a comment", () => {
    const loose = (source: string) =>
      appliesTo("@babel/plugin-transform-class-properties", "plugin", { loose: true }, source);
    expect(loose("class A<T> {\n  a = 1;\n}")).toBe(true);
    expect(loose("class A implements B {\n  a = 1;\n}")).toBe(true);
    expect(loose("export default class extends Base {}")).toBe(true);
    expect(loose("class A<T extends { a: number }> {\n  a = 1;\n}")).toBe(true);
    expect(loose("/* a class here */ const a = 1;")).toBe(false);
  });
  it("finds macro modules in each form", () => {
    const macro = (source: string) => appliesTo("babel-plugin-macros", "plugin", undefined, source);
    expect(macro("import t from 'x.macro'")).toBe(true);
    expect(macro("import t from 'x.macro.js'")).toBe(true);
    expect(macro("import t from 'lib/macro'")).toBe(true);
    expect(macro("import t from 'lib/macro/index'")).toBe(true);
    expect(macro("import t from 'macroeconomics'")).toBe(false);
  });
  it("classifies the common plugins by what they touch", () => {
    expect(trigger("@babel/plugin-transform-runtime", "plugin", { helpers: true })).toBeNull();
    expect(
      appliesTo("babel-plugin-transform-remove-console", "plugin", undefined, "console.log(1)"),
    ).toBe(true);
    expect(appliesTo("babel-plugin-transform-remove-console", "plugin", undefined, "log(1)")).toBe(
      false,
    );
    expect(
      appliesTo("@tamagui/babel-plugin", "plugin", {}, "import { Stack } from 'tamagui'"),
    ).toBe(true);
    expect(
      appliesTo("@tamagui/babel-plugin", "plugin", {}, "import { View } from 'react-native'"),
    ).toBe(false);
    expect(
      appliesTo(
        "react-native-paper/babel",
        "plugin",
        undefined,
        "import { Button } from 'react-native-paper'",
      ),
    ).toBe(true);
    expect(appliesTo("@babel/preset-typescript", "preset", { jsxPragma: "h" }, "<View />")).toBe(
      true,
    );
    expect(
      appliesTo("@babel/preset-typescript", "preset", { jsxPragma: "h" }, "const a = 1;"),
    ).toBe(false);
  });
});

describe("plugin keys from an expanded preset (#597 round 3)", () => {
  it("matches React Native's inline plugins across copies of the preset", () => {
    const a = "/app/node_modules/@react-native/babel-preset/src/index.js.overrides[5]$1";
    const b =
      "/repo/node_modules/.store/x/node_modules/@react-native/babel-preset/src/index.js.overrides[5]$1";
    expect(normalizePluginKey(a)).toBe(normalizePluginKey(b));
    expect(normalizePluginKey(a)).toBe("@react-native/babel-preset.overrides[5]$1");
    expect(
      normalizePluginKey("/m/node_modules/metro-react-native-babel-preset/src/configs/main.js$2"),
    ).toBe("metro-react-native-babel-preset$2");
    expect(normalizePluginKey("transform-modules-commonjs")).toBe("transform-modules-commonjs");
    expect(normalizePluginKey("/app/my-preset.cjs$0")).toBe("/app/my-preset.cjs$0");
  });
  it("names a key's package, and covers React Native's own Flow plugins", () => {
    expect(pluginNameOfKey("proposal-decorators")).toBe("@babel/plugin-proposal-decorators");
    expect(pluginNameOfKey("syntax-hermes-parser")).toBe("babel-plugin-syntax-hermes-parser");
    expect(trigger(pluginNameOfKey("syntax-hermes-parser"), "plugin")).toBeNull();
    expect(trigger(pluginNameOfKey("transform-flow-enums"), "plugin")).toBeNull();
  });
});
