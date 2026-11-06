// A project's root __mocks__/react-native.js under jest-compat (#566 review), in its own
// fixture app: it replaces react-native for every file.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(here, "root-mocks-rn"),
  plugins: [reactNative({ engine: "native", hotRuntime: false }), jestMockTransform()],
  resolve: { alias: { ...jestCompatAliases() } },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
    include: ["*.test.tsx"],
  },
});
