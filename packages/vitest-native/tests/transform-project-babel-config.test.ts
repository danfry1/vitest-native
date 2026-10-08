/**
 * App source that Node loads (require(), jest.requireActual, and what those load) is
 * compiled with the project's own Babel config, as babel-jest compiles it under Jest:
 * a macro or module-resolver plugin there would otherwise be missing, and a
 * `@lingui/core/macro` import fails at runtime with "Cannot find module
 * 'babel-plugin-macros'". React Native and other packages keep the fixed preset.
 *
 * Distinguishable at runtime: the project config's plugin and the stub preset stamp
 * different markers, and the config sees the caller babel-jest passes.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
// @ts-expect-error — runtime .mjs
import { transformRN } from "../src/native/transform.mjs";

const req = createRequire(import.meta.url);

/** A plugin source appending `var __VN_STAMP = <expression>;`. */
const stamp = (expression: string) => `{
  visitor: {
    Program: {
      exit(p) {
        p.pushContainer("body", require("@babel/core").template.statement.ast(
          "var __VN_STAMP = " + JSON.stringify(${expression}) + ";"
        ));
      },
    },
  },
}`;

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-babel-config-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app", private: true }));
  const presetDir = path.join(root, "node_modules", "@react-native", "babel-preset");
  fs.mkdirSync(presetDir, { recursive: true });
  fs.writeFileSync(
    path.join(presetDir, "package.json"),
    JSON.stringify({ name: "@react-native/babel-preset", version: "0.0.1-cfg", main: "index.js" }),
  );
  fs.writeFileSync(
    path.join(presetDir, "index.js"),
    `module.exports = () => ({ plugins: [${stamp('"preset"')}] });`,
  );
  const babelScope = path.join(root, "node_modules", "@babel");
  fs.mkdirSync(babelScope, { recursive: true });
  fs.symlinkSync(
    path.dirname(fs.realpathSync(req.resolve("@babel/core/package.json"))),
    path.join(babelScope, "core"),
    "dir",
  );
  fs.writeFileSync(
    path.join(root, "babel.config.js"),
    `module.exports = (api) => {
       const caller = api.caller((c) => c && c.name);
       return { plugins: [${stamp('"project-config:" + caller')}] };
     };`,
  );
  return root;
}

describe("the project's Babel config", () => {
  it("compiles app source as babel-jest does, and leaves packages on the preset", () => {
    const root = makeRoot();
    try {
      const app = path.join(root, "src", "app.ts");
      fs.mkdirSync(path.dirname(app));
      fs.writeFileSync(app, "module.exports = 1;\n");
      const pkg = path.join(root, "node_modules", "lib", "index.js");
      fs.mkdirSync(path.dirname(pkg), { recursive: true });
      fs.writeFileSync(pkg, "module.exports = 1;\n");

      expect(transformRN(app, fs.readFileSync(app, "utf8"), root)).toContain(
        'var __VN_STAMP = "project-config:babel-jest"',
      );
      expect(transformRN(pkg, fs.readFileSync(pkg, "utf8"), root)).toContain(
        'var __VN_STAMP = "preset"',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
