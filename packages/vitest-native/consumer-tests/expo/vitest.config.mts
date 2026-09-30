import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  test: {
    environment: "node",
    // expo-router/testing-library is Jest-authored and needs the dedicated config's
    // jest-compat setup plus real navigation stack. Keep the general Expo smoke run
    // separate; test-consumers runs `test:router` immediately after this leg.
    // An explicit include also preserves Vitest's node_modules exclusion instead of
    // replacing its complete default `exclude` list with a narrower local pattern.
    include: ["src/**/*.test.tsx"],
  },
});
