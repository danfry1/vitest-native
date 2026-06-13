import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native" }), jestMockTransform()],
  test: {
    globals: true,
    environment: "node",
    // jest-compat setup provides the `jest` global + the __vnInteropMock helper the
    // jestMockTransform-wrapped factories call (exercised by jest-mock-hoist.test).
    setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
    include: ["tests-native/*.test.tsx", "tests-native/*.test.ts"],
    exclude: ["tests-native/android.test.ts"],
  },
});
