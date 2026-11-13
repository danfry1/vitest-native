// A project whose only root manual mock is of a package a preset stands in for (#732), in
// its own fixture app. `--mode hot` runs it in a reused worker;
// scripts/test-root-mocks-registry.mjs runs it cold and then with a warm registry.
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
    root: path.join(here, "root-mocks-covered"),
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
        // scripts/test-root-mocks-registry.mjs reads whether the registry was compiled or reused.
        diagnostics: process.env.VN_REGISTRY_DIAGNOSTICS === "1",
      }),
      jestMockTransform(),
    ],
    resolve: { alias: { ...jestCompatAliases() } },
    test: {
      environment: "node",
      globals: true,
      setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
      include: ["*.test.tsx"],
    },
  };
});
