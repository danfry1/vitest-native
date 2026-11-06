// projectBabel (#579): project source that needs the project's Babel config compiles with
// it, and only that source (scripts/test-project-babel.mjs).
//
// VN_PROJECT_BABEL_FIXTURE picks the project root:
//   main  project-babel/: decorators and class properties for every file, a local plugin
//         for one file, Flow, and a plain file that must stay on Oxc;
//   rn    project-babel-rn/: a bare React Native config, which must not route;
//   expo  project-babel-expo/: an Expo config, which must not route.
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

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MODES = ["native", "hot", "mock", "never", "babel-plugin"];
const FIXTURES: Record<string, string> = {
  main: "project-babel",
  rn: "project-babel-rn",
  expo: "project-babel-expo",
};

// Stand-ins for the Babel Vite plugins a migrated app can have.
const babelVitePlugins: Plugin[] = [{ name: "vite:react-babel" }, { name: "babel" }];

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
  if (!fixture) throw new Error("VN_PROJECT_BABEL_FIXTURE must be main, rn or expo");
  return {
    root: path.join(here, fixture),
    plugins: [
      reactNative({
        engine: mode === "mock" ? "mock" : "native",
        hotRuntime: mode === "hot",
        projectBabel: mode === "never" ? "never" : "auto",
        diagnostics: true,
      }),
      ...(mode === "babel-plugin" ? babelVitePlugins : []),
    ],
    resolve: { alias: { "@babel/runtime": babelRuntime } },
    test: {
      environment: "node",
      include: ["*.test.{ts,tsx}"],
      ...(process.env.VN_PROJECT_BABEL_CACHE
        ? { fsModuleCachePath: process.env.VN_PROJECT_BABEL_CACHE }
        : {}),
    },
  };
});
