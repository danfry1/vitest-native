// The default native engine, with a detected package also named in `transform`, as
// projects written before detection list it.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false, transform: ["museum-flash"] })],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
