import { defineConfig } from "vitest/config";
import { reactNative } from "../../dist/index.mjs";

/**
 * Vitest's experimental native-import runner, paired with vitest-native's existing
 * Node transforms. This bypasses Vite's ModuleRunner entirely while retaining
 * Vitest's native mock loader.
 */
export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false })],
  test: {
    environment: "node",
    globals: true,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    sequence: { shuffle: false },
    include: ["validation/idiomatic/*.test.tsx"],
    setupFiles: ["./validation/native-runner/setup.mjs"],
    experimental: {
      viteModuleRunner: false,
      nodeLoader: false,
    },
  },
});
