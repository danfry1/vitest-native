import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { babelConfigFingerprint, fsModuleCacheKey } from "../src/fs-module-cache.js";
import {
  configItemName,
  hasFlowPragma,
  isProjectSourceFile,
  projectBabelTrigger,
} from "../src/project-babel.js";

const ROOT = "/app";
const trigger = (name: string, kind: "plugin" | "preset", options?: unknown) =>
  projectBabelTrigger({ name, kind, options }, ROOT, []);

describe("projectBabelTrigger: what needs the project's Babel config (#579)", () => {
  it("covers React Native's and Expo's presets, and standard ones, with harmless options", () => {
    expect(trigger("@react-native/babel-preset", "preset")).toBeNull();
    expect(
      trigger("@react-native/babel-preset", "preset", { enableBabelRuntime: false }),
    ).toBeNull();
    expect(trigger("babel-preset-expo", "preset", { reanimated: false })).toBeNull();
    expect(trigger("@babel/preset-typescript", "preset")).toBeNull();
  });

  it("triggers on a preset option that changes the output, and on an unknown preset", () => {
    expect(trigger("babel-preset-expo", "preset", { jsxImportSource: "nativewind" })).toBe(
      "babel-preset-expo's `jsxImportSource` option",
    );
    expect(trigger("@babel/preset-env", "preset", { loose: true })).toBe(
      "@babel/preset-env's `loose` option",
    );
    expect(trigger("nativewind/babel", "preset")).toBe("the preset nativewind/babel");
  });

  it("covers standard syntax plugins, but not decorators or semantic options", () => {
    expect(trigger("@babel/plugin-transform-export-namespace-from", "plugin")).toBeNull();
    expect(trigger("@babel/plugin-proposal-decorators", "plugin", { legacy: true })).toBe(
      "@babel/plugin-proposal-decorators",
    );
    expect(trigger("@babel/plugin-transform-class-properties", "plugin", { loose: true })).toBe(
      "@babel/plugin-transform-class-properties's `loose` option",
    );
  });

  it("triggers on macros and unknown plugins (fail-safe), not on module-resolver", () => {
    expect(trigger("babel-plugin-macros", "plugin")).toBe("babel-plugin-macros");
    expect(trigger("module:react-native-dotenv", "plugin")).toBe("module:react-native-dotenv");
    expect(trigger("./babel/custom.js", "plugin")).toBe("./babel/custom.js");
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
