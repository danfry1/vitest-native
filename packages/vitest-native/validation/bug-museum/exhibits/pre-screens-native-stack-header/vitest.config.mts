// A real navigator under the screens preset. transform: [@react-navigation/elements] works around the isolated-layout closure bug (pre-navigation-off-isolated, #348), as #341's own test does.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false, presets: { navigation: false }, transform: ["@react-navigation/elements"] })],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
