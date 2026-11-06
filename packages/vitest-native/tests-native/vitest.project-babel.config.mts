// projectBabel (#579): project source that needs the project's Babel config compiles with
// it (scripts/test-project-babel.mjs). Rooted at project-babel/, which has its own
// babel.config.js. Modes: native, hot, mock (all pass); never (Oxc only: the decorator
// file fails); deferred (a Babel Vite plugin is present, so projectBabel steps aside).
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MODES = ["native", "hot", "mock", "never", "deferred"];

// Stands in for @rolldown/plugin-babel: projectBabel recognizes it by name.
const fakeBabelPlugin: Plugin = { name: "fake-babel-for-test" };

export default defineConfig(({ mode }) => {
  if (!MODES.includes(mode)) throw new Error(`run with --mode ${MODES.join(", ")} (got '${mode}')`);
  return {
    root: path.join(here, "project-babel"),
    plugins: [
      reactNative({
        engine: mode === "mock" ? "mock" : "native",
        hotRuntime: mode === "hot",
        projectBabel: mode === "never" ? "never" : "auto",
      }),
      ...(mode === "deferred" ? [fakeBabelPlugin] : []),
    ],
    // No transform cache: each run compiles, so each run exercises the route.
    test: { environment: "node", include: ["*.test.ts"], fsModuleCache: false },
  };
});
