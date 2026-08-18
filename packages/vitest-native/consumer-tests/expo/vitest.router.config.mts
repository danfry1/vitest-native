import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

// Router-driven screens run against the REAL @react-navigation/* stack: expo-router's
// ExpoRoot is a React Navigation navigator (useNavigationBuilder + descriptors), so
// the navigation preset — a mock for unit-testing individual screens — is switched
// off for this project and the real packages are auto-detected and compiled like any
// other React Native dependency. Screens/gesture-handler/reanimated keep their presets.
//
// expo-router's own testing library is written for Jest (module-scope jest.mock,
// jest.useFakeTimers inside renderRouter), so the jest-compat layer is part of the
// configuration — the same layer a migrated jest-expo suite already brings.
export default defineConfig({
  plugins: [reactNative({ engine: "native", presets: { navigation: false } }), jestMockTransform()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [jestCompatSetup],
    include: ["router-tests/**/*.test.tsx"],
  },
});
