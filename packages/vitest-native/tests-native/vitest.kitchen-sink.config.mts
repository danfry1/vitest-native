// A Jest-migrated app that combines what real ones do (kitchen-sink/): babel.config.js
// with the worklets plugin, root __mocks__, a mock beside a module, a setup file with a
// library's own Jest mock, the presets the engine detects, and RNTL. Each feature has a
// suite of its own; this one catches their combinations (#666: root mocks + projectBabel).
// scripts/test-root-mocks-registry.mjs runs it cold, warm and hot.
import "./support/fresh-dist.mts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode !== "hot" && mode !== "stock") {
    throw new Error(`run with --mode hot or --mode stock (got '${mode}')`);
  }
  return {
    root: path.join(here, "kitchen-sink"),
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
        // scripts/test-root-mocks-registry.mjs reads whether the registry was compiled or reused.
        diagnostics: process.env.VN_REGISTRY_DIAGNOSTICS === "1",
      }),
      jestMockTransform(),
    ],
    resolve: {
      dedupe: ["react", "react-test-renderer", "react-is"],
      alias: { ...jestCompatAliases() },
    },
    test: {
      environment: "node",
      globals: true,
      setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs"), "./jest.setup.js"],
      include: ["__tests__/**/*.test.{ts,tsx}"],
      ...(mode === "hot" ? { maxWorkers: 1, fileParallelism: false } : {}),
    },
  };
});
