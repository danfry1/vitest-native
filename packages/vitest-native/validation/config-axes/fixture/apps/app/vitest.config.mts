// One config for every cell of the configuration-axis matrix. The harness
// (../../../run.mjs) sets the runtime axes through AXIS_* variables and the probe files
// to run on the command line; the install axes (Vitest, RNTL, layout) are what is in
// node_modules.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

const here = path.dirname(fileURLToPath(import.meta.url));
const ws = path.resolve(here, "../..");
const axis = (name: string) => process.env[`AXIS_${name}`];
const hot = axis("HOT") === "on";
const jestCompat = axis("JEST_COMPAT") === "on";

export default defineConfig({
  plugins: [
    ...(jestCompat ? [jestMockTransform()] : []),
    reactNative({
      engine: axis("ENGINE") === "mock" ? "mock" : "native",
      // Explicit either way: the default ('auto') decides by worker headroom, and a
      // cell must not change runtime with the runner's CPU count.
      hotRuntime: hot ? { allowUnboundedMemory: true } : false,
    }),
  ],
  resolve: {
    alias: [
      ...(jestCompat
        ? Object.entries(jestCompatAliases()).map(([find, replacement]) => ({ find, replacement }))
        : []),
      // String aliases into workspace source, keyed by package name: the reported shape.
      { find: "@axis/feature", replacement: path.join(ws, "packages/feature/src") },
      { find: "@axis/validator", replacement: path.join(ws, "packages/validator/src") },
      // Regex aliases, the shape Jest's moduleNameMapper migrates to.
      {
        find: /^@axis\/rfeature\/(.*)$/,
        replacement: `${path.join(ws, "packages/rfeature/src")}/$1`,
      },
      {
        find: /^@axis\/rvalidator\/(.*)$/,
        replacement: `${path.join(ws, "packages/rvalidator/src")}/$1`,
      },
    ],
  },
  test: {
    environment: "node",
    globals: axis("GLOBALS") === "on",
    setupFiles: jestCompat ? [jestCompatSetup] : [],
    include: ["probes/**/*.test.{ts,tsx}"],
    testTimeout: 5_000,
    hookTimeout: 5_000,
    // The hot pair (hot-automock-a/b) only shows its defect when both files run in one
    // worker, one after the other.
    ...(hot ? { maxWorkers: 1 } : {}),
  },
});
