// Two inline projects: one with vitest-native (hot runtime: auto, opt-in since #365), one plain.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [reactNative({ hotRuntime: "auto" })],
        test: { name: "native", include: ["native.test.tsx"] },
      },
      {
        test: { name: "plain", include: ["plain.test.ts"], environment: "node" },
      },
    ],
  },
});
