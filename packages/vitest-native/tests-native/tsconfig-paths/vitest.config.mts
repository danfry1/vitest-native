// A partial mock through `resolve.tsconfigPaths`, with its own root so the paths come
// from this directory's tsconfig.json.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../dist/index.mjs";
import { jestMockTransform } from "../../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [reactNative({ engine: "native", hotRuntime: false }), jestMockTransform()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [path.resolve(here, "../../dist/jest-compat/setup.mjs")],
    include: ["*.test.ts"],
  },
});
