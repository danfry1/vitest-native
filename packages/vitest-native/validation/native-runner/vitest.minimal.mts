import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["validation/native-runner/minimal.test.mjs"],
    experimental: {
      viteModuleRunner: false,
    },
  },
});
