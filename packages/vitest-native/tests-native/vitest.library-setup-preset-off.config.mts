// library-setup-files.test.tsx with the gestureHandler preset turned off, as a project
// keeps `presets: { gestureHandler: false }` from a setup that used its own mocks (#351).
// Under the native engine Gesture Handler runs as itself either way, and its own Jest
// setup still replaces its native layer.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";
import { NATIVE_SUITE_SETUP_FILES } from "./support/setup-files.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

export default defineConfig({
  plugins: [
    reactNative({ engine: "native", hotRuntime: false, presets: { gestureHandler: false } }),
    jestMockTransform(OTHER_FIXTURES_MOCKS),
  ],
  test: {
    globals: true,
    environment: "node",
    setupFiles: NATIVE_SUITE_SETUP_FILES,
    include: ["tests-native/library-setup-files.test.tsx"],
  },
});
