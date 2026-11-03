// The app points its workspace libraries at their source: aliases contributed by another plugin's config() hook.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false }),
    {
      name: "workspace-aliases",
      config: () => ({
        resolve: {
          alias: {
            "@m/feature": path.join(here, "packages/feature/src"),
            "@m/validator": path.join(here, "packages/validator/src"),
          },
        },
      }),
    },
  ],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
