import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const root = import.meta.dirname;
const bootstrap = path.join(root, "bootstrap.mjs");
const installHotAfterSetup = path.join(root, "install-hot-after-setup.mjs");
const runner = path.join(root, "runner.mjs");

export default defineConfig({
  plugins: [
    reactNative({ engine: "native", hotRuntime: false }),
    {
      name: "vitest-native:module-isolation-experiment",
      configResolved(config) {
        const setupFiles = config.test?.setupFiles ?? [];
        config.test.setupFiles = [bootstrap, ...setupFiles, installHotAfterSetup];
      },
    },
  ],
  test: {
    isolate: "modules",
    runner,
    environment: "node",
    include: ["hot-isolation/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: {
      shuffle: false,
    },
    env: {
      VITEST_NATIVE_HOT_PRESERVE_GLOBALS: JSON.stringify([
        "__VN_EXPLICIT_RESIDENT_GLOBAL__",
      ]),
    },
  },
});
