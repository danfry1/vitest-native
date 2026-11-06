// JSX in a project's own .js files (setup, test and source), under the engine and
// runtime `--mode` names: `native`, `hot` (the native engine's hot runtime) or `mock`.
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import { reactNative } from "../dist/index.mjs";

// A project's own plugins, listed after reactNative() with the default order: one serves a
// .js file from load, one transforms a .js file (plugins.test.tsx).
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
];

export default defineConfig(({ mode }) => {
  if (mode !== "native" && mode !== "hot" && mode !== "mock") {
    throw new Error(`run with --mode native, hot or mock (got '${mode}')`);
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
      setupFiles: ["./tests-native/project-js-jsx/setup.js"],
      include: ["tests-native/project-js-jsx/*.test.{js,tsx}"],
    },
  };
});
