// The app points its workspace libraries at their source: aliases on test.projects[] (an inline project).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  test: {
    include: ["*.test.{ts,tsx}"],
    projects: [
      {
        extends: true,
        resolve: {
          alias: {
            "@m/feature": path.join(here, "packages/feature/src"),
            "@m/validator": path.join(here, "packages/validator/src"),
          },
        },
        test: { name: "app", include: ["*.test.{ts,tsx}"] },
      },
    ],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
