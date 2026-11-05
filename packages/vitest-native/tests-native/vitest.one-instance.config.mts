// Project-module sharing with nothing but the native engine: no jest-compat setup, no
// library Jest setup files, so the sharing it checks is the engine's own. Run per
// runtime: `--mode stock` and `--mode hot`. `--mode early` adds a preset that creates the
// registry before the setup installs the sharing; `--mode jest-compat` adds jest-compat's
// setup, which must give the same answers.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      ...(mode === "early"
        ? { presets: { "./tests-native/one-instance-early/early-registry-preset.ts": true } }
        : {}),
      // Each of these is two live instances on purpose: the tests pin today's behaviour
      // where one module is not shared, so the change that shares it flips them. The
      // ownership guard names every one, and fails on anything else.
      ownership: {
        mode: "error",
        allow: [
          {
            path: path.join(here, "one-instance/fixtures/order-store.ts"),
            reason: "require-then-import.test.ts: required before it is imported (Node first)",
          },
          {
            path: path.join(here, "one-instance/fixtures/held.ts"),
            reason: "shapes.test.ts: a module Node already holds stays the one require returns",
          },
          {
            path: path.join(here, "one-instance/fixtures/cyc-a.ts"),
            reason: "shapes.test.ts: a file Vite is still evaluating is not shared (a cycle)",
          },
          {
            path: path.join(here, "one-instance/fixtures/isolated-late.ts"),
            reason: "shapes.test.ts: inside an isolation block, require is not handed Vite's copy",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "vn-alias-probe/feature": path.join(here, "one-instance/fixtures/aliased-feature.ts"),
    },
  },
  test: {
    globalSetup: [path.join(here, "one-instance/packages.global.ts")],
    ...(mode === "jest-compat"
      ? { setupFiles: [path.join(here, "../dist/jest-compat/setup.mjs")] }
      : {}),
    environment: "node",
    include: ["tests-native/one-instance/*.test.ts"],
    // Hot: every file on one worker, in order, so hot-1..3 share it.
    ...(mode === "hot"
      ? { maxWorkers: 1, minWorkers: 1, fileParallelism: false, sequence: { shuffle: false } }
      : {}),
  },
}));
