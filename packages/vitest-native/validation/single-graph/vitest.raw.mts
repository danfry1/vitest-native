import { defineConfig } from "vitest/config";
import { getPlatformExtensions } from "../../src/resolve";
import { singleGraphReactNative } from "./plugin.mts";

export default defineConfig({
  plugins: [singleGraphReactNative()],
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
    include: ["validation/single-graph/smoke.test.tsx"],
    setupFiles: ["./validation/single-graph/setup.mts"],
    server: {
      deps: {
        inline: true,
      },
    },
  },
});
