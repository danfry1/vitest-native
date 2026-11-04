// The native engine with `nativeModules: 'permissive'`, in an Expo app (expo resolves).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false, nativeModules: "permissive" })],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
