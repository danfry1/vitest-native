// jest.replaceProperty() under a project that sets restoreMocks (jest-compat restores it
// before each test, as Jest does), otherwise as tests-native/vitest.config.mts runs.
import { defineConfig } from "vitest/config";
import base from "./vitest.config.mts";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    restoreMocks: true,
    include: ["tests-native/jest-compat-restore-mocks/*.test.ts"],
  },
});
