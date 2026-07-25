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

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native" }), jestMockTransform()],
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    // Read by pool-identity.test.ts, which asserts this suite really is forked. Without
    // it that test cannot tell which config it is running under, and this suite could
    // quietly become a duplicate of test:native.
    env: { VN_EXPECT_POOL: "forks" },
    setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
    include: ["tests-native/*.test.tsx", "tests-native/*.test.ts"],
    // See vitest.config.mts: these two require their own dedicated config files.
    exclude: ["tests-native/android.test.ts", "tests-native/navigation-params.test.tsx"],
  },
});
