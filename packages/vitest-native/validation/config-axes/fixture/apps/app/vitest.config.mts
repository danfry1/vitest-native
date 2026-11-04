// One config for every cell of the configuration-axis matrix. The harness
// (../../../run.mjs) sets the runtime axes through AXIS_* variables and the probe files
// to run on the command line; the install axes (Vitest, RNTL, layout) are what is in
// node_modules.
import fs from "node:fs";
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
const ownershipModel = axis("OWNERSHIP_MODEL");
// The option for run.mjs --ownership, and the marker run.mjs checks: written only where
// the option is built, so a flag-on run whose flag never reaches reactNative() fails.
const ownershipOptions = () => {
  if (!ownershipModel || ownershipModel === "off") return {};
  const marker = axis("OWNERSHIP_MARKER");
  if (marker) fs.writeFileSync(marker, `${ownershipModel}\n`);
  return { experimental: { ownershipModel } };
};

export default defineConfig({
  plugins: [
    ...(jestCompat ? [jestMockTransform()] : []),
    reactNative({
      // "default" leaves an option unset, as a new project has it (the extra "defaults"
      // run in axes.json).
      ...(axis("ENGINE") === "default"
        ? {}
        : { engine: axis("ENGINE") === "mock" ? ("mock" as const) : ("native" as const) }),
      // Explicit otherwise: the default ('auto') decides by worker headroom, and a cell
      // must not change runtime with the runner's CPU count.
      ...(axis("HOT") === "default"
        ? {}
        : { hotRuntime: hot ? { allowUnboundedMemory: true } : false }),
      // run.mjs --ownership: "off" (every CI cell) leaves the option unset.
      ...ownershipOptions(),
    }),
  ],
  resolve: {
    alias: [
      ...(jestCompat
        ? Object.entries(jestCompatAliases()).map(([find, replacement]) => ({ find, replacement }))
        : []),
      // String aliases into workspace source, keyed by package name: the shape that loaded twice.
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
    // The hot pairs only show their defect when both files run in one worker, one after
    // the other. The "hot, 2 workers" extra run sets AXIS_WORKERS and excludes them.
    ...(hot ? { maxWorkers: Number(axis("WORKERS") ?? 1) } : {}),
  },
});
