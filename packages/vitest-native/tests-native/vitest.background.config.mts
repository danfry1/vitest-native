// The cold-cache background registry build (registry-background.test.ts). Each test
// starts real Vitest runs against a scratch project, so this file takes minutes; CI
// runs it in its own step on one leg per OS instead of inside every native suite.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests-native/registry-background.test.ts"],
  },
});
