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
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
// @ts-expect-error — runtime .mjs
import { transformRN } from "../src/native/transform.mjs";

const TRANSFORM_URL = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/native/transform.mjs"),
).href;

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

function makeRoot(
  config: string | null = `module.exports = (api) => {
       const caller = api.caller((c) => c && c.name);
       return { plugins: [${stamp('"project-config:" + caller')}] };
     };`,
): string {
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
  if (config) fs.writeFileSync(path.join(root, "babel.config.js"), config);
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

/** A fresh process's transform of `file`: a new process reads the disk cache. */
function transformInChild(file: string, root: string, env: Record<string, string>): string {
  const script =
    `const { transformRN } = await import(${JSON.stringify(TRANSFORM_URL)});` +
    `const fs = await import("node:fs");` +
    `process.stdout.write(transformRN(process.argv[1], fs.readFileSync(process.argv[1], "utf8"), process.argv[2]));`;
  return execFileSync(process.execPath, ["--input-type=module", "-e", script, file, root], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function writeApp(root: string, rel: string, source = "module.exports = 1;\n"): string {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
}

describe("the transform cache, for app source under a project Babel config", () => {
  // babel-jest keys its cache on the options loadPartialConfig returns (build/index.js,
  // getCacheKeyFromConfig). A function config can read the environment through
  // api.cache.using, so the config file's bytes alone served the previous output.
  it("is keyed on the options Babel loaded, not on the config file's bytes", () => {
    const root = makeRoot(`module.exports = (api) => {
         const flag = api.cache.using(() => process.env.RB_FLAG);
         return { plugins: [["./flag-plugin.js", { flag }]] };
       };`);
    try {
      fs.writeFileSync(
        path.join(root, "flag-plugin.js"),
        `module.exports = ({ types: t }) => ({
           visitor: {
             Identifier(p, state) {
               if (p.node.name === "__FLAG__") p.replaceWith(t.stringLiteral(state.opts.flag));
             },
           },
         });`,
      );
      const app = writeApp(root, "src/flag.ts", "module.exports = __FLAG__;\n");
      expect(transformInChild(app, root, { RB_FLAG: "three" })).toContain('"three"');
      expect(transformInChild(app, root, { RB_FLAG: "four" })).toContain('"four"');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("which Babel config applies to app source", () => {
  // Babel decides, so every config it supports is found: package.json#babel was missed
  // by a hand-kept list of file names, as were babel.config.ts and .babelrc.mjs.
  it("is whatever @babel/core loads, package.json#babel included", () => {
    const root = makeRoot(null);
    try {
      const pluginFile = path.join(root, "stamp-plugin.js");
      fs.writeFileSync(pluginFile, `module.exports = () => (${stamp('"package-json"')});`);
      fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "app", private: true, babel: { plugins: ["./stamp-plugin.js"] } }),
      );
      const app = writeApp(root, "src/app.ts");
      expect(transformRN(app, fs.readFileSync(app, "utf8"), root)).toContain(
        'var __VN_STAMP = "package-json"',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("is the React Native preset when the project has none", () => {
    const root = makeRoot(null);
    try {
      const app = writeApp(root, "src/app.ts");
      expect(transformRN(app, fs.readFileSync(app, "utf8"), root)).toContain(
        'var __VN_STAMP = "preset"',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // babel-jest's assertLoadedBabelConfig (build/index.js:103-113) throws for a file the
  // config ignores; transformSync returns null for it, which crashed on `.code`.
  it("rejects a file the config ignores, as babel-jest does", () => {
    const root = makeRoot(`module.exports = { ignore: ["./src/ignored.ts"], only: ["./src"] };`);
    try {
      const ignored = writeApp(root, "src/ignored.ts");
      const outside = writeApp(root, "lib/outside.ts");
      expect(() => transformRN(ignored, fs.readFileSync(ignored, "utf8"), root)).toThrow(
        /Babel ignores src\/ignored\.ts/,
      );
      expect(() => transformRN(outside, fs.readFileSync(outside, "utf8"), root)).toThrow(
        /Babel ignores lib\/outside\.ts/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // jest-expo's platform presets configure babel-jest with a Metro caller carrying the
  // platform (config/getPlatformPreset.js), which babel-preset-expo reads.
  it("sees jest-expo's caller, with the platform, in a project with Expo", () => {
    const root = makeRoot(`module.exports = (api) => {
         const caller = api.caller((c) => c && [c.name, c.bundler, c.platform].join(":"));
         return { plugins: [${stamp('"caller:" + caller')}] };
       };`);
    try {
      const expo = path.join(root, "node_modules", "expo");
      fs.mkdirSync(expo, { recursive: true });
      fs.writeFileSync(path.join(expo, "package.json"), JSON.stringify({ name: "expo" }));
      const app = writeApp(root, "src/app.ts");
      const src = fs.readFileSync(app, "utf8");
      expect(transformRN(app, src, root, "android")).toContain(
        'var __VN_STAMP = "caller:metro:metro:android"',
      );
      expect(transformRN(app, src, root, "ios")).toContain(
        'var __VN_STAMP = "caller:metro:metro:ios"',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
