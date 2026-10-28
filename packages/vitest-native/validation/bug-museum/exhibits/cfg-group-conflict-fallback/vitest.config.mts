// Two inline projects: one with vitest-native (default runtime: hot auto), one plain.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [reactNative()],
        test: { name: "native", include: ["native.test.tsx"] },
      },
      {
        test: { name: "plain", include: ["plain.test.ts"], environment: "node" },
      },
    ],
  },
});
