// An alias keyed on a preset package's name, the shape a Jest `moduleNameMapper` entry
// for react-native-safe-area-context migrates to. Its own config: the alias would apply
// to every file of the shared suite that imports the package.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false })],
  resolve: {
    alias: {
      "react-native-safe-area-context": path.resolve(here, "fixtures/dispatch-alias-target.cjs"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    // Relative: an absolute include is a glob that matches nothing on Windows (see
    // vitest.advice.config.mts).
    include: ["tests-native/dispatch-alias/*.test.ts"],
  },
});
