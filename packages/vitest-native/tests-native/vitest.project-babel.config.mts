// projectBabel (#579): project source that needs the project's Babel config compiles with
// it, and only that source (scripts/test-project-babel.mjs).
//
// VN_PROJECT_BABEL_FIXTURE picks the project root:
//   main  project-babel/: decorators and class properties for every file, a local plugin
//         for one file, Flow, and a plain file that must stay on Oxc;
//   rn    project-babel-rn/: a bare React Native config, which must not route;
//   expo  project-babel-expo/: an Expo config, which must not route;
//   wrap  project-babel-wrap/: an app preset wrapping React Native's, which must not route;
//   cjs   project-babel-cjs/: an app preset adding a plugin that writes CommonJS: Oxc, warned;
//   wrapdec  project-babel-wrapdec/: an app preset wrapping React Native's and adding
//         decorators: only the decorator file routes, and stays an ES module;
//   cjslabel  project-babel-cjslabel/: a CommonJS-writing plugin beside another unknown one
//         the file needs: fails by name instead of dropping it;
//   expoesm  project-babel-expoesm/: Bluesky's babel-preset-expo shape (its native module
//         transform on, a dynamic-import plugin): a routed file still compiles as ESM.
//   virtual  project-babel-virtual/: ids spelled as files under the root that only a plugin
//         serves (#666): jest-compat's root-mocks setup module (a root __mocks__ for an
//         installed package), and a plugin's virtual .ts and .js modules.
// --mode: native, hot, mock; never (Oxc only: the decorator file fails); babel-plugin (a
// Babel Vite plugin is in the config, as @vitejs/plugin-react's or a babel() entry: the
// engine still compiles what needs the project's config).
// VN_PROJECT_BABEL_CACHE is Vitest's transform cache directory, so a gate run can be cold
// then warm.
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MODES = ["native", "hot", "mock", "never", "babel-plugin"];
const FIXTURES: Record<string, string> = {
  main: "project-babel",
  rn: "project-babel-rn",
  expo: "project-babel-expo",
  wrap: "project-babel-wrap",
  cjs: "project-babel-cjs",
  wrapdec: "project-babel-wrapdec",
  cjslabel: "project-babel-cjslabel",
  expoesm: "project-babel-expoesm",
  virtual: "project-babel-virtual",
};

// The Babel Vite plugins a migrated app can have: @vitejs/plugin-react's name, and a
// babel() entry that runs the worklets plugin, as #581's wiring does, on the worklet file
// projectBabel has already compiled with it.
const babel = require("@babel/core");

// A normal-order plugin serving modules whose ids are absolute paths under the root, with
// no file behind them. The .ts one has a JSDoc tag projectBabel's decorator test reads past;
// the .js one is plain JavaScript (Vite does not compile JSX in a .js id it serves).
function virtualModules(root: string): Plugin {
  const modules: Record<string, string> = {
    "virtual:decorated": path.join(root, "src", "virtual-decorated.ts"),
    "virtual:view": path.join(root, "src", "virtual-view.js"),
  };
  const ids = new Map(Object.values(modules).map((file) => [file.split(path.sep).join("/"), file]));
  return {
    name: "vn-test-virtual-modules",
    // Its own name, or the root-relative spelling Vitest's module cache hands back on a warm
    // run (as jest-compat's root-mocks module resolves both).
    resolveId(id) {
      const file = modules[id] ?? (id.startsWith("/") ? path.join(root, id) : undefined);
      const spelled = file?.split(path.sep).join("/");
      return spelled && ids.has(spelled) ? spelled : null;
    },
    load(id) {
      const file = ids.get(id);
      if (!file) return null;
      return file.endsWith(".ts")
        ? `/** @deprecated a decorator-looking line */\nexport const decorated: string = "served by the plugin";\n`
        : `export const view = { type: "Text", children: "virtual" };\n`;
    },
  };
}
const workletsPlugin = require.resolve("react-native-worklets/plugin");
const babelVitePlugins: Plugin[] = [
  { name: "vite:react-babel" },
  {
    name: "babel",
    async transform(code, id) {
      if (!/[\\/]project-babel[\\/]src[\\/]worklet\.ts$/.test(id)) return undefined;
      const out = await babel.transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        plugins: [workletsPlugin],
      });
      return { code: out.code, map: out.map };
    },
  },
];

// @babel/runtime, which React Native's preset imports helpers from: an app depends on it,
// this package reaches it through react-native.
const babelRuntime = path.dirname(
  require.resolve("@babel/runtime/package.json", {
    paths: [path.dirname(require.resolve("react-native/package.json"))],
  }),
);

export default defineConfig(({ mode }) => {
  if (!MODES.includes(mode)) throw new Error(`run with --mode ${MODES.join(", ")} (got '${mode}')`);
  const fixture = FIXTURES[process.env.VN_PROJECT_BABEL_FIXTURE ?? "main"];
  if (!fixture) throw new Error("VN_PROJECT_BABEL_FIXTURE must be main, rn, expo, wrap, cjs, wrapdec, cjslabel, expoesm or virtual");
  const fixtureRoot = path.join(here, fixture);
  const virtual = fixture === "project-babel-virtual";
  return {
    root: fixtureRoot,
    plugins: [
      reactNative({
        engine: mode === "mock" ? "mock" : "native",
        hotRuntime: mode === "hot",
        projectBabel: mode === "never" ? "never" : "auto",
        diagnostics: true,
      }),
      ...(mode === "babel-plugin" ? babelVitePlugins : []),
      ...(virtual ? [jestMockTransform(), virtualModules(fixtureRoot)] : []),
    ],
    resolve: {
      alias: { "@babel/runtime": babelRuntime, ...(virtual ? jestCompatAliases() : {}) },
    },
    test: {
      environment: "node",
      ...(virtual
        ? { globals: true, setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")] }
        : {}),
      include: ["*.test.{ts,tsx}"],
      ...(process.env.VN_PROJECT_BABEL_CACHE
        ? { fsModuleCachePath: process.env.VN_PROJECT_BABEL_CACHE }
        : {}),
    },
  };
});
