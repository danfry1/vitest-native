// No jest-compat and no setup files: Reanimated is served by the preset. VN_HOT=true
// runs the hot runtime; VN_ENGINE=mock the mock engine.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [
    reactNative({
      hotRuntime: process.env.VN_HOT === "true",
      ...(process.env.VN_ENGINE === "mock" ? { engine: "mock" as const } : {}),
    }),
  ],
  test: { include: ["card.test.tsx"], globals: true },
});
