import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  plugins: [reactNative({ ownership: "error", engine: "native", hotRuntime: false, platform: "android" })],
  test: {
    globals: true,
    environment: "node",
    include: ["tests-native/android.test.ts"],
  },
});
