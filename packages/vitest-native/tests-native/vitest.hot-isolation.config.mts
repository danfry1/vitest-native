import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: {
        allowUnboundedMemory: true,
        preserveGlobals: ["__VN_EXPLICIT_RESIDENT_GLOBAL__"],
      },
      // Compiled by the engine, so 18-compiled-package-reload can load a compiled file
      // again (the package publishes JSX).
      transform: ["untranspiled-jsx-lib"],
    }),
  ],
  test: {
    // A temporary root per run, removed afterwards: the resolution-memo pair leaves its
    // marker there.
    globalSetup: [path.resolve(here, "../tests/support/temp-root.global.ts")],
    environment: "node",
    include: ["tests-native/hot-isolation/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: {
      shuffle: false,
    },
  },
});
