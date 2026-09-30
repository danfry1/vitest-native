import path from "node:path";
import { defineConfig } from "vitest/config";
import { getPlatformExtensions } from "../../src/resolve";
import { commonJsReactNativeBackToVitest } from "../single-graph/optimizer.mts";
import { singleGraphReactNative } from "../single-graph/plugin.mts";

export default defineConfig({
  plugins: [
    singleGraphReactNative({
      capsule: true,
      namedCapsuleExports: true,
      bridgeNodeRequire: true,
      virtualizeDeepThroughCapsule: true,
    }),
  ],
  resolve: {
    conditions: ["react-native"],
    extensions: getPlatformExtensions("ios"),
    mainFields: ["react-native", "module", "jsnext:main", "jsnext"],
    dedupe: ["react", "react-test-renderer", "test-renderer", "react-is"],
  },
  ssr: {
    resolve: {
      conditions: ["react-native"],
      mainFields: ["react-native", "module", "jsnext:main", "jsnext"],
    },
  },
  test: {
    environment: "node",
    globals: true,
    isolate: false,
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    sequence: { shuffle: false },
    include: [path.resolve("validation/idiomatic/*.test.tsx")],
    setupFiles: ["./validation/selective-persistence/setup.mts"],
    runner: "./validation/selective-persistence/runner.mjs",
    server: { deps: { inline: true } },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["@testing-library/react-native"],
          exclude: ["react-native"],
          rolldownOptions: {
            plugins: [commonJsReactNativeBackToVitest()],
          },
        },
      },
    },
  },
});
