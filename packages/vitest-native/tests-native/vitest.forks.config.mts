// The package's own native suite on the FORKS pool.
//
// When a project configures a VM pool, the plugin throws and tells the user to switch
// to 'threads' or 'forks'. Nothing verified the second half of that advice: no config
// and no CI step ran the forks pool, so an error message was directing people at an
// untested configuration. It works — this keeps it working.
//
// Forks matter beyond the error message: they are how a project isolates native
// addons or works around thread-unsafe dependencies, and the native engine's module
// hooks have to install in a child process just as they do in a worker thread.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";
import { NATIVE_SUITE_SETUP_FILES } from "./support/setup-files.mjs";
import { NATIVE_SUITE_OWNERSHIP } from "./support/ownership-allow.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // The expo preset, which the native engine applies only when asked
  // (NATIVE_ENGINE_RUNS_PACKAGES), is turned on, so this suite runs Expo's packages
  // as the preset serves them; the packed Expo consumers run the real packages.
  plugins: [
    // This suite asserts the precompiled registry itself (registry-identity, stack
    // frames, module semantics), so a cold run builds it first.
    reactNative({
      engine: "native",
      hotRuntime: false,
      presets: { expo: true },
      registryBuild: "wait",
      ownership: NATIVE_SUITE_OWNERSHIP,
    }),
    jestMockTransform(OTHER_FIXTURES_MOCKS),
  ],
  // The tsconfig-paths-style alias requireactual-alias.test.tsx exercises.
  resolve: { alias: { "@vn-app": path.resolve(here, "fixtures/alias-app") } },
  test: {
    globalSetup: [path.resolve(here, "support/dispatch-fixtures.global.ts")],
    globals: true,
    environment: "node",
    pool: "forks",
    // Read by pool-identity.test.ts, which asserts this suite really is forked. Without
    // it that test cannot tell which config it is running under, and this suite could
    // quietly become a duplicate of test:native.
    env: { VN_EXPECT_POOL: "forks" },
    setupFiles: NATIVE_SUITE_SETUP_FILES,
    include: ["tests-native/*.test.tsx", "tests-native/*.test.ts"],
    // See vitest.config.mts: these two require their own dedicated config files.
    // registry-background.test.ts spawns its own Vitest runs (vitest.background.config.mts).
    exclude: [
      "tests-native/android.test.ts",
      "tests-native/navigation-params.test.tsx",
      "tests-native/registry-background.test.ts",
    ],
  },
});
