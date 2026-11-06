// JSX in a project's own .js files (setup, test and source), under the engine and
// runtime `--mode` names: `native`, `hot` (the native engine's hot runtime), `mock`, or
// `projects` (ios and android projects sharing the same .js setup file, run together).
import flowRemoveTypes from "flow-remove-types";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

// A project's own plugins, listed after reactNative() with the default order: one serves a
// .js file from load, one transforms a .js file (plugins.test.tsx), and one strips Flow
// as an app's Babel/Flow plugin would (flow.test.tsx).
const projectPlugins: Plugin[] = [
  {
    name: "project-load",
    load(id) {
      if (id.endsWith("/project-js-jsx/served-by-plugin.js")) {
        return 'export const servedBy = "plugin";';
      }
    },
  },
  {
    name: "project-transform",
    transform(code, id) {
      if (id.endsWith("/project-js-jsx/transformed.js")) {
        return code.replace("__PROJECT_TRANSFORM__", "applied");
      }
    },
  },
  {
    name: "project-flow",
    transform(code, id) {
      if (id.endsWith(".js") && code.includes("@flow")) {
        const stripped = flowRemoveTypes(code, { all: true });
        return { code: stripped.toString(), map: stripped.generateMap() };
      }
    },
  },
];

const SETUP = "./tests-native/project-js-jsx/setup.js";
const INCLUDE = ["tests-native/project-js-jsx/*.test.{js,tsx}"];

export default defineConfig(({ mode }) => {
  if (mode === "projects") {
    // Two projects, one .js setup file: both load it at once, each in its own
    // environment.
    return {
      test: {
        projects: (["ios", "android"] as const).map((platform) => ({
          plugins: [reactNative({ engine: "native", platform }), ...projectPlugins],
          test: { name: platform, environment: "node", setupFiles: [SETUP], include: INCLUDE },
        })),
      },
    };
  }
  if (mode !== "native" && mode !== "hot" && mode !== "mock") {
    throw new Error(`run with --mode native, hot, mock or projects (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({
        engine: mode === "mock" ? "mock" : "native",
        hotRuntime: mode === "hot",
      }),
      ...projectPlugins,
    ],
    test: {
      environment: "node",
      setupFiles: [SETUP],
      include: INCLUDE,
    },
  };
});
