import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

// Router-driven screens run against real React Navigation: expo-router's ExpoRoot is a
// React Navigation navigator (useNavigationBuilder + descriptors). From SDK 57
// expo-router bundles its own copy (expo-router/build/react-navigation) instead of
// depending on @react-navigation/*, so the navigation preset — keyed on those packages
// and a mock for unit-testing individual screens — never applies to it, and nothing
// needs switching off. Before SDK 57 the router used the installed @react-navigation/*
// packages, and the preset had to be off (`presets: { navigation: false }`).
//
// expo-router's own testing library is written for Jest (module-scope jest.mock,
// jest.useFakeTimers inside renderRouter), so the jest-compat layer is part of the
// configuration — the same layer a migrated jest-expo suite already brings.
export default defineConfig({
  plugins: [reactNative({ engine: "native" }), jestMockTransform()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [jestCompatSetup],
    include: ["router-tests/**/*.test.tsx"],
  },
});
